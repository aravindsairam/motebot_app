import { CommandType } from '../transport/messages';
import {
  assistantStatusFrame,
  helloFrame,
  replyFrame,
  ReplyResult,
  replyWith,
  robotStateFrame,
  sentCommands,
  TestSocket,
} from '../transport/testSocket';
import { askRobot, startNewChat } from './ask';
import { doingLine } from './chat';
import { useChat } from './chatStore';
import { connectTo, disconnect } from './client';
import { useRobot } from './store';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
  startNewChat();
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

// `now`: the connection's clock. Held still, a long wait does not count as a silent robot.
function connected(now?: () => number) {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create, now });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame('idle', { currentMap: 'house' }));
  return socket;
}

const questions = (socket: TestSocket) => sentCommands(socket).filter((c) => c.type === CommandType.COMMAND_ASK_ASSISTANT);

describe('asking the robot', () => {
  it("sends the question in this chat's conversation, and the answer joins the chat", async () => {
    const socket = connected();
    const { conversation } = useChat.getState();
    expect(conversation).toMatch(/^phone-/);
    const asking = askRobot('Where are you?');
    await flush();
    const [sent] = questions(socket);
    expect(sent.question).toEqual({ conversation, text: 'Where are you?' });
    expect(useChat.getState().waiting).toBe(true);
    socket.deliver(
      replyWith(sent.requestId, ReplyResult.RESULT_OK, '', {
        answer: { text: "I'm in the kitchen.", toolsUsed: ['look'], pictureJpeg: Uint8Array.from([0xff, 0xd8]), markCm: [855, -125] },
      }),
    );
    await asking;
    const s = useChat.getState();
    expect(s.waiting).toBe(false);
    expect(s.bubbles.map((b) => [b.from, b.text])).toEqual([
      ['me', 'Where are you?'],
      ['robot', "I'm in the kitchen."],
    ]);
    expect(s.bubbles[1]).toMatchObject({ problem: false, picture: Uint8Array.from([0xff, 0xd8]), mark: { x: 8.55, y: -1.25 } });
  });

  it('the same conversation carries on; a new chat starts another', async () => {
    const socket = connected();
    const first = useChat.getState().conversation;
    const a = askRobot('Hello');
    await flush();
    socket.deliver(replyWith(questions(socket)[0].requestId, ReplyResult.RESULT_OK, '', { answer: { text: 'Hello!' } }));
    await a;
    const b = askRobot('And again');
    await flush();
    expect(questions(socket)[1].question?.conversation).toBe(first);
    socket.deliver(replyWith(questions(socket)[1].requestId, ReplyResult.RESULT_OK, '', { answer: { text: 'Yes?' } }));
    await b;
    startNewChat();
    expect(useChat.getState()).toMatchObject({ bubbles: [], waiting: false });
    expect(useChat.getState().conversation).not.toBe(first);
  });

  it('one question at a time', async () => {
    const socket = connected();
    void askRobot('One');
    void askRobot('Two');
    await flush();
    expect(questions(socket).map((q) => q.question?.text)).toEqual(['One']);
    expect(useChat.getState().bubbles).toHaveLength(1);
  });

  it("no API key: the robot's words on how to add one, as a muted bubble", async () => {
    const socket = connected();
    const asking = askRobot('What can you do?');
    await flush();
    socket.deliver(
      replyWith(questions(socket)[0].requestId, ReplyResult.RESULT_REFUSED, 'no API key', {
        answer: { text: 'I need an API key to answer. Add one on the PC and ask again.' },
      }),
    );
    await asking;
    expect(useChat.getState().bubbles[1]).toMatchObject({ from: 'robot', problem: true, text: 'I need an API key to answer. Add one on the PC and ask again.' });
  });

  it('not available: the reason in the message', async () => {
    const socket = connected();
    const asking = askRobot('Hello');
    await flush();
    socket.deliver(replyFrame(questions(socket)[0].requestId, ReplyResult.RESULT_NOT_AVAILABLE, 'nothing on the robot answers questions yet'));
    await asking;
    expect(useChat.getState().bubbles[1]).toMatchObject({ problem: true, text: 'Nothing on the robot answers questions yet.' });
  });

  it('waits up to 10 minutes, then says there was no answer', async () => {
    connected(() => 1000);
    const asking = askRobot('Go to the kitchen and look');
    await flush();
    jest.advanceTimersByTime(9 * 60_000);
    await flush();
    expect(useChat.getState().waiting).toBe(true);
    jest.advanceTimersByTime(60_000 + 1);
    await asking;
    expect(useChat.getState().bubbles[1]).toMatchObject({ problem: true, text: expect.stringMatching(/^No answer within 600 s/) });
    expect(useChat.getState().waiting).toBe(false);
  });

  it('a lost connection ends the wait, and the chat is kept', async () => {
    connected();
    const asking = askRobot('Hello');
    await flush();
    TestSocket.latest().fail('gone');
    await asking;
    const s = useChat.getState();
    expect(s.waiting).toBe(false);
    expect(s.bubbles[1]).toMatchObject({ problem: true, text: expect.stringMatching(/connection was lost/) });
    disconnect();
    expect(useChat.getState().bubbles).toHaveLength(2);
  });

  it('not connected: says so at once', async () => {
    await askRobot('Hello');
    expect(useChat.getState().bubbles[1]).toMatchObject({ problem: true, text: 'Not connected to the robot.' });
  });

  it('an answer that comes after a new chat is dropped', async () => {
    const socket = connected();
    const asking = askRobot('Hello');
    await flush();
    startNewChat();
    socket.deliver(replyWith(questions(socket)[0].requestId, ReplyResult.RESULT_OK, '', { answer: { text: 'Hello!' } }));
    await asking;
    expect(useChat.getState()).toMatchObject({ bubbles: [], waiting: false });
  });

  it("shows what the robot is doing for this chat's question, from its status", async () => {
    const socket = connected();
    void askRobot('Is the kitchen clean?');
    await flush();
    const mine = useChat.getState().conversation;
    socket.deliver(assistantStatusFrame(true, mine, 'going to the kitchen'));
    expect(doingLine(useChat.getState(), useRobot.getState().assistant?.value ?? null)).toBe('Going to the kitchen…');
    socket.deliver(assistantStatusFrame(true, 'phone-other', 'looking around'));
    expect(doingLine(useChat.getState(), useRobot.getState().assistant?.value ?? null)).toBeNull();
    disconnect();
    expect(useRobot.getState().assistant).toBeNull();
  });
});
