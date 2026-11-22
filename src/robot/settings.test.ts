import { CommandType } from '../transport/messages';
import { heartbeatFrame, helloFrame, replyFrame, ReplyResult, robotStateFrame, sentCommands, settingsFrame, TestSocket } from '../transport/testSocket';
import { showNotice, useActions } from './actionsStore';
import { connectTo, disconnect } from './client';
import { changeSettings, setRowAngleAuto, SETTINGS_REFUSED, stepRowAngle, stepSetting } from './settings';
import { useSettings } from './settingsStore';
import { shownSettings } from './settingsSync';
import { useRobot } from './store';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
  useActions.setState({ busy: null, notice: null });
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

/** Connected; the robot has sent its settings unless `settings` is null. */
function connected(settings: Parameters<typeof settingsFrame>[0] | null = {}) {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame('idle', { currentMap: 'house' }));
  if (settings !== null) socket.deliver(settingsFrame(settings));
  return socket;
}

const sets = (socket: TestSocket) => sentCommands(socket).filter((c) => c.type === CommandType.COMMAND_SET_ROBOT_SETTINGS);
const shown = () => shownSettings(useSettings.getState());

describe("the robot's settings", () => {
  it('arrive with their limits and are what the controls show', () => {
    connected({ rowAngleAuto: false, rowAngle: 45 });
    const s = useRobot.getState().settings?.value;
    expect(s?.cleaningSpeed).toBeCloseTo(0.2);
    expect(s?.manualSpeed).toBeCloseTo(0.3);
    expect(s?.rowSpacing).toBe(0.25);
    expect(s?.rowAngleAuto).toBe(false);
    expect(s?.rowAngle).toBe(45);
    expect(s?.manualTurnSpeed).toBeCloseTo(1.2);
    expect(s?.limits.cleaningSpeedMax).toBeCloseTo(0.3);
    expect(s?.limits.rowSpacingStep).toBeCloseTo(0.05);
    expect(shown()).toMatchObject({ rowSpacing: 0.25, rowAngleAuto: false, rowAngle: 45 });
    expect(shown()).not.toHaveProperty('limits');
  });

  it('are unknown until the robot sends them, and nothing can be changed', () => {
    const socket = connected(null);
    expect(useRobot.getState().settings).toBeNull();
    expect(shown()).toBeNull();
    changeSettings({ cleaningSpeed: 0.25 });
    expect(sets(socket)).toHaveLength(0);
    expect(shown()).toBeNull();
  });

  it('follow the robot when another phone changes them', () => {
    const socket = connected();
    socket.deliver(settingsFrame({ rowSpacing: 0.15 }));
    expect(shown()?.rowSpacing).toBeCloseTo(0.15);
    expect(useRobot.getState().settings?.value.rowSpacing).toBeCloseTo(0.15);
  });

  it('stay as they were while reconnecting, and are forgotten on disconnect', () => {
    const socket = connected();
    socket.fail('lost');
    expect(useRobot.getState().connection.kind).toBe('connecting');
    expect(useRobot.getState().settings?.value.rowSpacing).toBe(0.25);
    expect(shown()?.rowSpacing).toBe(0.25);
    disconnect();
    expect(useRobot.getState().settings).toBeNull();
    expect(shown()).toBeNull();
  });
});

describe('changing a setting', () => {
  it('shows at once and sends the complete set, without the limits or the turn speed', async () => {
    const socket = connected();
    changeSettings({ rowAngleAuto: false, rowAngle: 45 });
    expect(shown()).toMatchObject({ rowAngleAuto: false, rowAngle: 45 });
    const [sent] = sets(socket);
    expect(sent.settings?.cleaningSpeed).toBeCloseTo(0.2);
    expect(sent.settings?.manualSpeed).toBeCloseTo(0.3);
    expect(sent.settings?.rowSpacing).toBe(0.25);
    expect(sent.settings?.rowAngleAuto).toBe(false);
    expect(sent.settings?.rowAngle).toBe(45);
    expect(sent.settings?.limits ?? null).toBeNull();
    expect(sent.settings?.manualTurnSpeed).toBe(0);

    // the robot saves them, tells every phone, and answers
    socket.deliver(settingsFrame({ rowAngleAuto: false, rowAngle: 45 }));
    socket.deliver(replyFrame(sent.requestId, ReplyResult.RESULT_OK, 'saved: row direction 45°'));
    await flush();
    expect(shown()).toMatchObject({ rowAngleAuto: false, rowAngle: 45 });
    expect(useSettings.getState()).toMatchObject({ wanted: null, inFlight: null });
    expect(useActions.getState().notice).toBeNull();
    expect(sets(socket)).toHaveLength(1);
  });

  it('does not jump back when the answer comes before the new settings', async () => {
    const socket = connected();
    changeSettings({ cleaningSpeed: 0.25 });
    const [sent] = sets(socket);
    socket.deliver(replyFrame(sent.requestId, ReplyResult.RESULT_OK));
    await flush();
    expect(shown()?.cleaningSpeed).toBe(0.25);
    expect(useRobot.getState().settings?.value.cleaningSpeed).toBeCloseTo(0.2); // the robot's own report is not touched
    socket.deliver(settingsFrame({ cleaningSpeed: 0.25 }));
    expect(shown()?.cleaningSpeed).toBe(0.25);
    expect(useRobot.getState().settings?.value.cleaningSpeed).toBe(0.25);
  });

  it('after OK, what the robot reports is the truth, even when it is not what was asked for', async () => {
    const socket = connected();
    changeSettings({ cleaningSpeed: 0.25 });
    const [sent] = sets(socket);
    socket.deliver(settingsFrame({ cleaningSpeed: 0.25, rowSpacing: 0.15 }));
    socket.deliver(replyFrame(sent.requestId, ReplyResult.RESULT_OK));
    await flush();
    expect(shown()?.rowSpacing).toBeCloseTo(0.15);
  });

  it('several quick taps: one request at a time, then the newest set', async () => {
    const socket = connected();
    changeSettings({ cleaningSpeed: 0.25 });
    changeSettings({ cleaningSpeed: 0.3 });
    changeSettings({ rowSpacing: 0.3 });
    expect(shown()).toMatchObject({ cleaningSpeed: 0.3, rowSpacing: 0.3 });
    expect(sets(socket)).toHaveLength(1);
    expect(sets(socket)[0].settings?.cleaningSpeed).toBe(0.25);

    socket.deliver(settingsFrame({ cleaningSpeed: 0.25 }));
    socket.deliver(replyFrame(sets(socket)[0].requestId, ReplyResult.RESULT_OK));
    await flush();
    expect(sets(socket)).toHaveLength(2); // the set in between was never sent
    expect(sets(socket)[1].settings?.cleaningSpeed).toBeCloseTo(0.3);
    expect(sets(socket)[1].settings?.rowSpacing).toBeCloseTo(0.3);
    expect(shown()).toMatchObject({ cleaningSpeed: 0.3, rowSpacing: 0.3 });

    socket.deliver(settingsFrame({ cleaningSpeed: 0.3, rowSpacing: 0.3 }));
    socket.deliver(replyFrame(sets(socket)[1].requestId, ReplyResult.RESULT_OK));
    await flush();
    expect(sets(socket)).toHaveLength(2);
    expect(useSettings.getState()).toMatchObject({ wanted: null, inFlight: null });
    expect(shown()?.cleaningSpeed).toBeCloseTo(0.3);
  });

  it('a change back to what the robot has sends nothing', () => {
    const socket = connected();
    changeSettings({ rowSpacing: 0.25 });
    expect(sets(socket)).toHaveLength(0);
    expect(useSettings.getState().inFlight).toBeNull();
  });
});

describe('the plus and minus buttons', () => {
  it('move a speed by 0.05 m/s and the spacing by the robot\'s step', () => {
    const socket = connected();
    stepSetting('cleaningSpeed', 1);
    expect(shown()?.cleaningSpeed).toBe(0.25);
    expect(sets(socket)[0].settings?.cleaningSpeed).toBe(0.25);
    stepSetting('rowSpacing', -1);
    expect(shown()?.rowSpacing).toBe(0.2);
    stepSetting('manualSpeed', -1);
    expect(shown()?.manualSpeed).toBe(0.25);
  });

  it('quick taps each move on from the last, stop at the limit, and go out as one more request', async () => {
    const socket = connected();
    stepSetting('cleaningSpeed', 1); // 0.20 to 0.25: sent
    stepSetting('cleaningSpeed', 1); // 0.30: waits
    stepSetting('cleaningSpeed', 1); // at the limit: nothing
    stepSetting('cleaningSpeed', 1);
    expect(shown()?.cleaningSpeed).toBe(0.3);
    expect(sets(socket)).toHaveLength(1);
    socket.deliver(settingsFrame({ cleaningSpeed: 0.25 }));
    socket.deliver(replyFrame(sets(socket)[0].requestId, ReplyResult.RESULT_OK));
    await flush();
    expect(sets(socket)).toHaveLength(2);
    expect(sets(socket)[1].settings?.cleaningSpeed).toBeCloseTo(0.3);
    socket.deliver(settingsFrame({ cleaningSpeed: 0.3 }));
    socket.deliver(replyFrame(sets(socket)[1].requestId, ReplyResult.RESULT_OK));
    await flush();
    expect(sets(socket)).toHaveLength(2);
    expect(shown()?.cleaningSpeed).toBeCloseTo(0.3);
    stepSetting('cleaningSpeed', 1); // still at the limit, now as the robot reports it
    expect(sets(socket)).toHaveLength(2);
  });

  it('at a limit send nothing', () => {
    const socket = connected(); // the joystick speed is at its upper limit
    stepSetting('manualSpeed', 1);
    expect(sets(socket)).toHaveLength(0);
    expect(shown()?.manualSpeed).toBeCloseTo(0.3);
  });

  it('do nothing before the robot has sent its settings', () => {
    const socket = connected(null);
    stepSetting('cleaningSpeed', 1);
    stepRowAngle(1);
    setRowAngleAuto(false);
    expect(sets(socket)).toHaveLength(0);
    expect(shown()).toBeNull();
  });

  it('turn Auto off and on, and step the angle round', async () => {
    const socket = connected({ rowAngleAuto: true, rowAngle: 170 });
    setRowAngleAuto(false);
    expect(shown()).toMatchObject({ rowAngleAuto: false, rowAngle: 170 });
    expect(sets(socket)[0].settings).toMatchObject({ rowAngleAuto: false, rowAngle: 170 });
    stepRowAngle(1);
    stepRowAngle(1);
    expect(shown()?.rowAngle).toBe(0); // 175, then round to 0
    stepRowAngle(-1);
    expect(shown()?.rowAngle).toBe(175);
    socket.deliver(replyFrame(sets(socket)[0].requestId, ReplyResult.RESULT_OK));
    await flush();
    expect(sets(socket)[1].settings).toMatchObject({ rowAngleAuto: false, rowAngle: 175 });
    setRowAngleAuto(true);
    expect(shown()).toMatchObject({ rowAngleAuto: true, rowAngle: 175 }); // the angle is kept for later
  });
});

describe('when the robot does not change them', () => {
  it("refused: back to the robot's values, with its reason on the message card", async () => {
    const socket = connected();
    changeSettings({ cleaningSpeed: 0.5 });
    expect(shown()?.cleaningSpeed).toBe(0.5);
    const [sent] = sets(socket);
    socket.deliver(replyFrame(sent.requestId, ReplyResult.RESULT_REFUSED, 'the cleaning speed must be between 0.10 and 0.30 m/s (asked for 0.50)'));
    await flush();
    expect(shown()?.cleaningSpeed).toBeCloseTo(0.2);
    expect(useSettings.getState()).toMatchObject({ wanted: null, inFlight: null });
    expect(useActions.getState().notice).toEqual({
      tone: 'error',
      title: "Couldn't change the settings",
      text: 'The cleaning speed must be between 0.10 and 0.30 m/s (asked for 0.50).',
    });
  });

  it('refused: the taps that were waiting are dropped too, and nothing more is sent', async () => {
    const socket = connected();
    changeSettings({ cleaningSpeed: 0.25 });
    changeSettings({ cleaningSpeed: 0.3 });
    socket.deliver(replyFrame(sets(socket)[0].requestId, ReplyResult.RESULT_REFUSED, 'could not save the settings: disk full'));
    await flush();
    expect(sets(socket)).toHaveLength(1);
    expect(shown()?.cleaningSpeed).toBeCloseTo(0.2);
  });

  it('the settings service is not running: back, and the card says so', async () => {
    const socket = connected();
    changeSettings({ manualSpeed: 0.15 });
    socket.deliver(replyFrame(sets(socket)[0].requestId, ReplyResult.RESULT_NOT_AVAILABLE, "the robot's settings service is not running"));
    await flush();
    expect(shown()?.manualSpeed).toBeCloseTo(0.3);
    expect(useActions.getState().notice).toMatchObject({ tone: 'error', title: SETTINGS_REFUSED, text: "The robot's settings service is not running." });
  });

  it('an answer without a reason still gets a card', async () => {
    const socket = connected();
    changeSettings({ manualSpeed: 0.15 });
    socket.deliver(replyFrame(sets(socket)[0].requestId, ReplyResult.RESULT_ERROR));
    await flush();
    expect(useActions.getState().notice).toMatchObject({ title: SETTINGS_REFUSED, text: 'The robot gave no reason.' });
  });

  it('the connection is lost before the answer: back, and the card says so', async () => {
    const socket = connected();
    changeSettings({ rowSpacing: 0.3 });
    expect(shown()?.rowSpacing).toBe(0.3);
    socket.fail('lost');
    await flush();
    expect(shown()?.rowSpacing).toBe(0.25);
    expect(useActions.getState().notice).toMatchObject({ tone: 'error', title: SETTINGS_REFUSED });
    expect(useActions.getState().notice?.text).toMatch(/connection was lost/);
  });

  it('no answer in time: back to what the robot last reported', async () => {
    const socket = connected();
    changeSettings({ rowSpacing: 0.3 });
    for (let second = 1; second <= 24; second++) {
      jest.advanceTimersByTime(1000);
      socket.deliver(heartbeatFrame(second)); // the connection itself stays up
    }
    await flush();
    expect(shown()?.rowSpacing).toBe(0.3); // still waiting
    expect(useActions.getState().notice).toBeNull();
    for (let second = 25; second <= 27; second++) {
      jest.advanceTimersByTime(1000);
      socket.deliver(heartbeatFrame(second));
    }
    await flush();
    expect(useRobot.getState().connection.kind).toBe('connected');
    expect(shown()?.rowSpacing).toBe(0.25);
    expect(useSettings.getState().inFlight).toBeNull();
    expect(useActions.getState().notice).toMatchObject({ title: SETTINGS_REFUSED, text: 'No answer within 25 s; the robot may still act on it.' });
  });

  it('disconnecting with a request on its way leaves no card behind', async () => {
    connected();
    changeSettings({ rowSpacing: 0.3 });
    disconnect();
    await flush();
    expect(useActions.getState().notice).toBeNull();
    expect(shown()).toBeNull();
  });

  it('an answer from before a reconnect does not disturb a request made after it', async () => {
    connected();
    changeSettings({ rowSpacing: 0.3 });
    disconnect();
    const socket = connected();
    changeSettings({ rowSpacing: 0.2 });
    await flush(); // the first request's failure arrives now
    expect(shown()?.rowSpacing).toBe(0.2);
    expect(useSettings.getState().inFlight).not.toBeNull();
    expect(useActions.getState().notice).toBeNull();
    expect(sets(socket)).toHaveLength(1);
  });

  it('the next change takes the old card away; other cards stay', async () => {
    const socket = connected();
    changeSettings({ cleaningSpeed: 0.5 });
    socket.deliver(replyFrame(sets(socket)[0].requestId, ReplyResult.RESULT_REFUSED, 'too fast'));
    await flush();
    expect(useActions.getState().notice?.title).toBe(SETTINGS_REFUSED);
    changeSettings({ cleaningSpeed: 0.25 });
    expect(useActions.getState().notice).toBeNull();

    const other = { tone: 'info' as const, title: 'Stopped. Still mapping', text: '' };
    showNotice(other);
    changeSettings({ cleaningSpeed: 0.3 });
    expect(useActions.getState().notice).toBe(other);
  });
});
