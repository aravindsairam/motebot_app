import { CommandType } from '../transport/messages';
import { helloFrame, replyFrame, ReplyResult, robotStateFrame, sentCommands, settingsFrame, TestSocket } from '../transport/testSocket';
import { useActions } from './actionsStore';
import { connectTo, disconnect } from './client';
import { DEAD_ZONE, DRIVE_PERIOD_MS, holdStick, isDriving, MAX_FORWARD, MAX_TURN, releaseStick, stickToSpeeds, topSpeeds } from './drive';

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

describe("the stick's top speeds", () => {
  it("are the app's own until the robot has sent its settings", () => {
    expect(topSpeeds(null)).toEqual({ forward: MAX_FORWARD, turn: MAX_TURN });
    expect(topSpeeds(undefined)).toEqual({ forward: 0.3, turn: 1.2 });
  });

  it("are the robot's joystick speed and the turn speed that follows it", () => {
    expect(topSpeeds({ manualSpeed: 0.15, manualTurnSpeed: 0.6 })).toEqual({ forward: 0.15, turn: 0.6 });
  });

  it('fall back one by one: a robot that sends no turn speed, or a value that cannot be a speed', () => {
    expect(topSpeeds({ manualSpeed: 0.15, manualTurnSpeed: 0 })).toEqual({ forward: 0.15, turn: MAX_TURN });
    expect(topSpeeds({ manualSpeed: 0, manualTurnSpeed: 0.6 })).toEqual({ forward: MAX_FORWARD, turn: 0.6 });
    expect(topSpeeds({ manualSpeed: NaN, manualTurnSpeed: -1 })).toEqual({ forward: MAX_FORWARD, turn: MAX_TURN });
  });

  it('scale the whole of the stick: full push is the top speed, the dead zone stays', () => {
    const top = { forward: 0.15, turn: 0.6 };
    expect(stickToSpeeds(0, 1, top).forward).toBeCloseTo(0.15);
    expect(stickToSpeeds(0, -3, top).forward).toBeCloseTo(-0.15);
    expect(stickToSpeeds(1, 0, top).turn).toBeCloseTo(-0.6);
    expect(stickToSpeeds(-1, 0, top).turn).toBeCloseTo(0.6);
    expect(stickToSpeeds(DEAD_ZONE * 0.9, 0, top)).toEqual({ forward: 0, turn: 0 });
    // the same push gives the same share of the top speed
    expect(stickToSpeeds(0, 0.5, top).forward / 0.15).toBeCloseTo(stickToSpeeds(0, 0.5).forward / MAX_FORWARD);
    expect(stickToSpeeds(0.5, 0, top).turn / 0.6).toBeCloseTo(stickToSpeeds(0.5, 0).turn / MAX_TURN);
  });
});

describe('driving', () => {
  it("drives at the robot's joystick speed once the robot has sent its settings, and follows a change", () => {
    const socket = connected();
    holdStick(0, 1);
    expect(drives(socket)[0].drive?.forward).toBeCloseTo(MAX_FORWARD); // not known yet
    socket.deliver(settingsFrame({ manualSpeed: 0.125, manualTurnSpeed: 0.5 }));
    jest.advanceTimersByTime(DRIVE_PERIOD_MS);
    expect(drives(socket)[1].drive).toEqual({ forward: 0.125, turn: -0 });
    holdStick(-1, 0);
    jest.advanceTimersByTime(DRIVE_PERIOD_MS);
    expect(drives(socket)[2].drive?.turn).toBeCloseTo(0.5);
    socket.deliver(settingsFrame({ manualSpeed: 0.25, manualTurnSpeed: 1 }));
    jest.advanceTimersByTime(DRIVE_PERIOD_MS);
    expect(drives(socket)[3].drive?.turn).toBeCloseTo(1);
  });

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
