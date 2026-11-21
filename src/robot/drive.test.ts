import { CommandType } from '../transport/messages';
import { helloFrame, replyFrame, ReplyResult, robotStateFrame, sentCommands, TestSocket } from '../transport/testSocket';
import { useActions } from './actionsStore';
import { connectTo, disconnect } from './client';
import { DEAD_ZONE, DRIVE_PERIOD_MS, holdStick, isDriving, MAX_FORWARD, MAX_TURN, releaseStick, stickToSpeeds } from './drive';

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
});
afterEach(() => {
  releaseStick();
  disconnect();
  jest.useRealTimers();
});

function connected() {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame('manual', { currentMap: 'house', allowedTransitions: ['idle'] }));
  return socket;
}

const drives = (socket: TestSocket) => sentCommands(socket).filter((c) => c.type === CommandType.COMMAND_DRIVE);

describe('the stick', () => {
  it('drives forward when pushed up and turns right when pushed right', () => {
    expect(stickToSpeeds(0, 1)).toEqual({ forward: MAX_FORWARD, turn: -0 });
    expect(stickToSpeeds(1, 0).turn).toBeCloseTo(-MAX_TURN);
    expect(stickToSpeeds(-1, 0).turn).toBeCloseTo(MAX_TURN);
    expect(stickToSpeeds(0, -1).forward).toBeCloseTo(-MAX_FORWARD);
  });

  it('does nothing in the dead zone, and no more than full speed beyond the rim', () => {
    expect(stickToSpeeds(DEAD_ZONE * 0.9, 0)).toEqual({ forward: 0, turn: 0 });
    expect(stickToSpeeds(0, 3).forward).toBeCloseTo(MAX_FORWARD);
    expect(stickToSpeeds(NaN, 0)).toEqual({ forward: 0, turn: 0 });
    const half = stickToSpeeds(0, 0.5).forward;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(MAX_FORWARD / 2);
  });

  it('a diagonal at the rim gives both speeds, neither at full', () => {
    const s = stickToSpeeds(Math.SQRT1_2, Math.SQRT1_2);
    expect(s.forward).toBeCloseTo(MAX_FORWARD * Math.SQRT1_2);
    expect(s.turn).toBeCloseTo(-MAX_TURN * Math.SQRT1_2);
  });
});

describe('driving', () => {
  it('sends 20 times a second while held, then one zero, then nothing', () => {
    const socket = connected();
    holdStick(0, 1);
    expect(isDriving()).toBe(true);
    jest.advanceTimersByTime(DRIVE_PERIOD_MS * 4);
    holdStick(-1, 0);
    jest.advanceTimersByTime(DRIVE_PERIOD_MS);
    const sent = drives(socket);
    expect(sent).toHaveLength(6);
    expect(sent[0].drive?.forward).toBeCloseTo(MAX_FORWARD);
    expect(sent[5].drive?.turn).toBeCloseTo(MAX_TURN);
    releaseStick();
    expect(isDriving()).toBe(false);
    jest.advanceTimersByTime(DRIVE_PERIOD_MS * 10);
    const after = drives(socket);
    expect(after).toHaveLength(7);
    expect(after[6].drive).toEqual({ forward: 0, turn: 0 });
  });

  it('says once that another phone is driving', async () => {
    const socket = connected();
    holdStick(0, 1);
    jest.advanceTimersByTime(DRIVE_PERIOD_MS * 2);
    for (const c of drives(socket)) socket.deliver(replyFrame(c.requestId, ReplyResult.RESULT_REFUSED, 'another phone is driving the robot'));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(useActions.getState().notice).toEqual({ tone: 'error', title: "Can't drive", text: 'Another phone is driving the robot.' });
  });
});
