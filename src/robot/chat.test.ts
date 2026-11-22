import { type AnswerOutcome, answered, asked, type ChatState, conversationId, doingLine, MAX_QUESTION_LENGTH, newChat } from './chat';
import { chipsFor, MAX_CHIPS } from './chatChips';
import { clearMark, MARK_SHOWN_MS, showMark, useMark } from './markStore';

const ANSWER = { text: "I'm in the kitchen.", toolsUsed: ['go_to_room', 'look'], picture: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), mark: { x: 8.55, y: -1.25 } };
const ok = (answer = ANSWER): AnswerOutcome => ({ ok: true, text: '', answer });
const no = (text: string, answerText = ''): AnswerOutcome => ({
  ok: false,
  text,
  answer: answerText ? { text: answerText, toolsUsed: [], picture: new Uint8Array(0), mark: null } : null,
});

/** A chat with one question waiting. */
function waiting(question = 'Where are you?'): ChatState {
  return asked(newChat('phone-a'), question).state;
}

describe('the conversation', () => {
  it('is "phone-" and eight letters or digits', () => {
    expect(conversationId()).toMatch(/^phone-[a-z0-9]{8}$/);
    expect(conversationId(() => 0)).toBe('phone-aaaaaaaa');
    expect(conversationId(() => 0.9999999)).toBe('phone-99999999');
    expect(conversationId()).not.toBe(conversationId());
  });

  it('a new chat has no bubbles and waits for nothing', () => {
    expect(newChat('phone-b')).toEqual({ conversation: 'phone-b', bubbles: [], waiting: false, nextId: 1 });
  });
});

describe('asking', () => {
  it('the question shows at once, and is sent', () => {
    const { state, send } = asked(newChat('phone-a'), '  Where are you?  ');
    expect(send).toBe('Where are you?');
    expect(state.waiting).toBe(true);
    expect(state.bubbles).toEqual([{ id: 1, from: 'me', text: 'Where are you?', problem: false, picture: null, mark: null }]);
  });

  it('one question at a time, and nothing empty', () => {
    const s = waiting();
    expect(asked(s, 'And now?')).toEqual({ state: s, send: null });
    const fresh = newChat('phone-a');
    expect(asked(fresh, '   ')).toEqual({ state: fresh, send: null });
  });

  it('a very long question is cut', () => {
    expect(asked(newChat('phone-a'), 'x'.repeat(MAX_QUESTION_LENGTH + 10)).send).toHaveLength(MAX_QUESTION_LENGTH);
  });
});

describe('the answer', () => {
  it('joins the chat with its picture and its place on the map', () => {
    const s = answered(waiting(), 'phone-a', ok());
    expect(s.waiting).toBe(false);
    expect(s.bubbles[1]).toEqual({ id: 2, from: 'robot', text: "I'm in the kitchen.", problem: false, picture: ANSWER.picture, mark: { x: 8.55, y: -1.25 } });
    expect(asked(s, 'Thanks').send).toBe('Thanks'); // the next question can go
  });

  it('a picture alone needs no words; no answer at all says so', () => {
    expect(answered(waiting(), 'phone-a', ok({ ...ANSWER, text: '' })).bubbles[1]).toMatchObject({ text: '', picture: ANSWER.picture });
    expect(answered(waiting(), 'phone-a', ok({ ...ANSWER, text: '', picture: new Uint8Array(0) })).bubbles[1]).toMatchObject({
      text: 'The robot gave no answer.',
      picture: null,
    });
    expect(answered(waiting(), 'phone-a', { ok: true, text: '', answer: null }).bubbles[1].text).toBe('The robot gave no answer.');
  });

  it("a refusal shows muted, with the robot's own words when it gave them", () => {
    const s = answered(waiting(), 'phone-a', no('no API key', 'There is no API key yet: add one on the PC, then ask again'));
    expect(s.bubbles[1]).toMatchObject({ from: 'robot', problem: true, text: 'There is no API key yet: add one on the PC, then ask again.' });
    expect(s.waiting).toBe(false);
  });

  it('a refusal without an answer gives the reason in the message', () => {
    expect(answered(waiting(), 'phone-a', no('nothing on the robot answers questions yet')).bubbles[1]).toMatchObject({
      problem: true,
      text: 'Nothing on the robot answers questions yet.',
    });
  });

  it('a timeout or a lost connection is shown the same way', () => {
    const timedOut = answered(waiting(), 'phone-a', no('no answer within 600 s; the robot may still act on it'));
    expect(timedOut.bubbles[1]).toMatchObject({ problem: true, text: 'No answer within 600 s; the robot may still act on it.' });
    expect(answered(waiting(), 'phone-a', no('')).bubbles[1].text).toBe("The robot couldn't answer.");
  });

  it('after a new chat, the answer for the old one is dropped', () => {
    const s = newChat('phone-b');
    expect(answered(s, 'phone-a', ok())).toBe(s);
    const asking = asked(s, 'Hello').state;
    expect(answered(asking, 'phone-a', ok())).toBe(asking); // still waiting for its own answer
  });
});

describe('what the robot is doing, under the dots', () => {
  const status = (busy: boolean, conversation: string, doing: string) => ({ busy, conversation, doing });

  it('shows for this chat only, while it waits', () => {
    expect(doingLine(waiting(), status(true, 'phone-a', 'going to the kitchen'))).toBe('Going to the kitchen…');
    expect(doingLine(waiting(), status(true, 'phone-z', 'going to the kitchen'))).toBeNull(); // another phone's question
    expect(doingLine(waiting(), status(false, 'phone-a', ''))).toBeNull();
    expect(doingLine(waiting(), status(true, 'phone-a', '  '))).toBeNull();
    expect(doingLine(waiting(), null)).toBeNull();
    expect(doingLine(newChat('phone-a'), status(true, 'phone-a', 'looking'))).toBeNull(); // nothing asked
  });
});

describe('the suggestions', () => {
  const idle = { connected: true, mode: 'idle', cleaning: 'none' as const, rooms: [] as string[] };

  it('while cleaning: how it goes, pause, stop', () => {
    expect(chipsFor({ ...idle, mode: 'cleaning', cleaning: 'running' })).toEqual(['How is the clean going?', 'Pause', 'Stop and go home']);
    expect(chipsFor({ ...idle, mode: 'cleaning', cleaning: 'paused' })).toEqual(['How is the clean going?', 'Resume', 'Stop and go home']);
    expect(chipsFor({ ...idle, mode: 'navigation', cleaning: 'running' })[0]).toBe('How is the clean going?'); // starting up
  });

  it('idle or docked, no rooms yet: find them', () => {
    const chips = ['What can you do?', 'What do you see?', 'How was the last clean?', 'Clean everything', 'Find the rooms'];
    expect(chipsFor(idle)).toEqual(chips);
    expect(chipsFor({ ...idle, mode: 'docked' })).toEqual(chips);
  });

  it('with rooms: the first two, at most six chips', () => {
    expect(chipsFor({ ...idle, rooms: ['Kitchen'] })).toEqual([
      'What can you do?',
      'What do you see?',
      'How was the last clean?',
      'Clean everything',
      'Clean the Kitchen',
      'Is the Kitchen clean?',
    ]);
    const chips = chipsFor({ ...idle, rooms: ['Kitchen', 'Bedroom', 'Hall'] });
    expect(chips).toHaveLength(MAX_CHIPS);
    expect(chips.slice(4)).toEqual(['Clean the Kitchen', 'Clean the Bedroom']);
    expect(chips.join(' ')).not.toMatch(/Hall/);
  });

  it('other modes, failsafe, and before the robot has said anything', () => {
    expect(chipsFor({ ...idle, mode: 'navigation' })).toEqual(['What are you doing?', 'What do you see?']);
    expect(chipsFor({ ...idle, mode: 'failsafe' })).toEqual(['What went wrong?', 'What can you do?']);
    expect(chipsFor({ ...idle, mode: '' })).toEqual(['What can you do?']);
    expect(chipsFor({ ...idle, connected: false })).toEqual([]);
  });
});

describe('a place shown on the map', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    clearMark();
    jest.useRealTimers();
  });

  it('stays a minute, or until cleared', () => {
    showMark(8.55, -1.25);
    expect(useMark.getState().mark).toMatchObject({ x: 8.55, y: -1.25 });
    jest.advanceTimersByTime(MARK_SHOWN_MS - 1);
    expect(useMark.getState().mark).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(useMark.getState().mark).toBeNull();
    showMark(1, 2);
    clearMark();
    expect(useMark.getState().mark).toBeNull();
  });

  it('a new one replaces the old, with its own minute and a new id', () => {
    showMark(1, 1);
    const first = useMark.getState().mark!;
    jest.advanceTimersByTime(MARK_SHOWN_MS / 2);
    showMark(2, 2);
    const second = useMark.getState().mark!;
    expect(second.id).not.toBe(first.id);
    jest.advanceTimersByTime(MARK_SHOWN_MS / 2 + 1);
    expect(useMark.getState().mark).toBe(second);
  });
});
