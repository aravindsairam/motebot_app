import * as fs from 'fs';
import * as path from 'path';

import { APP_VERSION } from '../version';
import { CommandType } from '../transport/messages';
import { connectTo, disconnect } from './client';
import { changeMode } from './commands';
import { modeLook } from './modes';
import { isFresh, STALE_AFTER_MS, useRobot } from './store';
import {
  helloFrame,
  mapFrame,
  poseFrame,
  replyFrame,
  ReplyResult,
  robotStateFrame,
  safetyFrame,
  sentCommands,
  settingsFrame,
  TestSocket,
} from '../transport/testSocket';
import { livePose } from './live';

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

const address = { url: 'ws://pc:9090', label: 'pc' };

describe('the robot store, fed by a connection', () => {
  it('holds the latest robot state and safety status, with when they arrived', () => {
    connectTo(address, { createSocket: TestSocket.create });
    expect(useRobot.getState().address).toBe('pc');
    expect(useRobot.getState().everConnected).toBe(false);
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    socket.deliver(robotStateFrame('mapping'));
    socket.deliver(safetyFrame('manual'));
    const s = useRobot.getState();
    expect(s.connection.kind).toBe('connected');
    expect(s.everConnected).toBe(true);
    expect(s.hello?.robotName).toBe('Test robot');
    expect(s.robotState?.value.state).toBe('mapping');
    expect(s.safety?.value.source).toBe('manual');
    expect(isFresh(s.robotState, Date.now())).toBe(true);
    expect(isFresh(s.robotState, Date.now() + STALE_AFTER_MS + 1)).toBe(false);
  });

  it('keeps the last copies while reconnecting, so the screen can show them as old', () => {
    connectTo(address, { createSocket: TestSocket.create });
    TestSocket.latest().deliver(helloFrame());
    TestSocket.latest().deliver(robotStateFrame('manual'));
    TestSocket.latest().fail('lost');
    const s = useRobot.getState();
    expect(s.connection.kind).toBe('connecting');
    expect(s.everConnected).toBe(true);
    expect(s.robotState?.value.state).toBe('manual');
  });

  it("connects with the phone's own WebSocket when the test does not supply one", () => {
    const original = globalThis.WebSocket;
    (globalThis as { WebSocket: unknown }).WebSocket = TestSocket;
    try {
      connectTo(address);
      TestSocket.latest().deliver(helloFrame());
      expect(useRobot.getState().connection.kind).toBe('connected');
    } finally {
      (globalThis as { WebSocket: unknown }).WebSocket = original;
    }
  });

  it('keeps the map in the store, and the position outside it', () => {
    connectTo(address, { createSocket: TestSocket.create });
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    socket.deliver(mapFrame(4));
    expect(useRobot.getState().map?.value).toMatchObject({ version: 4, width: 2, height: 2 });
    const seen: number[] = [];
    const off = livePose.subscribe((p) => seen.push(p.x));
    const renders = jest.fn();
    const unsubscribeStore = useRobot.subscribe(renders);
    socket.deliver(poseFrame(1.5, 2));
    expect(seen).toEqual([1.5]);
    expect(renders).toHaveBeenCalledTimes(1); // only "heard at" changed in the store
    off();
    unsubscribeStore();
  });

  it('skips a map that cannot be read and keeps the one it has', () => {
    connectTo(address, { createSocket: TestSocket.create });
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    socket.deliver(mapFrame(1));
    expect(() => socket.deliver(mapFrame(2, [9, 0]))).not.toThrow(); // 10 cells for a 2 x 2 map
    expect(useRobot.getState().map?.value.version).toBe(1);
    expect(useRobot.getState().connection.kind).toBe('connected');
  });

  it("holds the robot's settings, with when they arrived", () => {
    let clock = 5000;
    connectTo(address, { createSocket: TestSocket.create, now: () => clock });
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    expect(useRobot.getState().settings).toBeNull();
    clock = 6000;
    socket.deliver(settingsFrame({ rowSpacing: 0.25, rowAngleAuto: false, rowAngle: 90 }));
    expect(useRobot.getState().settings).toMatchObject({ at: 6000, value: { rowSpacing: 0.25, rowAngleAuto: false, rowAngle: 90 } });
  });

  it('forgets everything on disconnect', () => {
    connectTo(address, { createSocket: TestSocket.create });
    TestSocket.latest().deliver(helloFrame());
    TestSocket.latest().deliver(poseFrame(1, 1));
    TestSocket.latest().deliver(settingsFrame());
    disconnect();
    expect(useRobot.getState()).toMatchObject({
      address: null,
      connection: { kind: 'stopped' },
      everConnected: false,
      robotState: null,
      map: null,
      settings: null,
    });
    expect(livePose.value).toBeNull();
  });
});

describe('commands', () => {
  it('asks the robot for a mode and passes on its answer in its own words', async () => {
    connectTo(address, { createSocket: TestSocket.create });
    TestSocket.latest().deliver(helloFrame());
    const outcome = changeMode('docking');
    const [sent] = sentCommands(TestSocket.latest());
    expect(sent).toMatchObject({ type: CommandType.COMMAND_CHANGE_MODE, mode: 'docking' });
    TestSocket.latest().deliver(replyFrame(sent.requestId, ReplyResult.RESULT_REFUSED, 'no saved map yet'));
    await expect(outcome).resolves.toEqual({ ok: false, text: 'no saved map yet' });
  });

  it('says so when not connected, without throwing', async () => {
    await expect(changeMode('idle')).resolves.toEqual({ ok: false, text: 'not connected to the robot' });
  });

  it('measures the delay with a ping every 2 s while connected', async () => {
    let clock = 1000;
    connectTo(address, { createSocket: TestSocket.create, now: () => clock });
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    jest.advanceTimersByTime(2000);
    const pings = sentCommands(socket).filter((c) => c.type === CommandType.COMMAND_PING);
    expect(pings).toHaveLength(1);
    clock += 25;
    socket.deliver(replyFrame(pings[0].requestId, ReplyResult.RESULT_OK));
    await Promise.resolve();
    await Promise.resolve();
    expect(useRobot.getState().pingMs).toBe(25);
  });
});

describe('modes', () => {
  it('has friendly names for known modes and shows unknown ones by name', () => {
    expect(modeLook('navigation').label).toBe('Navigation');
    expect(modeLook('exploring')).toEqual({ label: 'Exploring', color: '#0369a1' });
    expect(modeLook('charging')).toEqual({ label: 'Charging', color: '#6b7280' }); // a mode added after this app
    expect(modeLook('').label).toBe('Unknown');
  });
});

describe('version', () => {
  it('matches app.json', () => {
    const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'app.json'), 'utf8'));
    expect(APP_VERSION).toBe(appJson.expo.version);
  });
});
