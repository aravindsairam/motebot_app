import { CommandType } from '../transport/messages';
import {
  freeMapFrame,
  helloFrame,
  navigationFrame,
  NavState,
  poseFrame,
  replyFrame,
  ReplyResult,
  robotStateFrame,
  sentCommands,
  TestSocket,
  zonesFrame,
} from '../transport/testSocket';
import { SUCCESS_SHOWN_MS, useActions } from './actionsStore';
import { connectTo, disconnect } from './client';
import { controlsFor } from './controls';
import { useRobot } from './store';
import { arrivalHeading, goToPin, placePin, startPicking, stopPicking } from './trip';
import { useTrip } from './tripStore';
import { tripView } from './tripView';

const GOAL = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

function connected(state = 'idle') {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame(state, { currentMap: 'house', allowedTransitions: ['navigation', 'manual'] }));
  socket.deliver(poseFrame(0, 0));
  // 5 m x 5 m of free floor around the robot, with a wall cell at (2.3, 2.3)
  socket.deliver(freeMapFrame(100, 100, 0.05, -2.5, -2.5, { [96 * 100 + 96]: 100 }));
  return socket;
}

describe('going to a point', () => {
  it('picks a pin, moves it, and forgets it on cancel', () => {
    connected();
    placePin(1, 1); // not picking yet: ignored
    expect(useTrip.getState().pin).toBeNull();
    startPicking();
    placePin(1, 1);
    placePin(2, 0.5);
    expect(useTrip.getState()).toMatchObject({ picking: true, pin: { x: 2, y: 0.5, problem: null } });
    stopPicking();
    expect(useTrip.getState()).toMatchObject({ picking: false, pin: null });
  });

  it('asks for navigation first, then sends the goal facing the way of travel, and keeps its id', async () => {
    const socket = connected('idle');
    startPicking();
    placePin(1, 1);
    const done = goToPin();
    expect(useActions.getState().busy).toBe('goto');
    let sent = sentCommands(socket);
    expect(sent[0]).toMatchObject({ type: CommandType.COMMAND_CHANGE_MODE, mode: 'navigation' });
    socket.deliver(replyFrame(sent[0].requestId, ReplyResult.RESULT_OK, 'now in navigation'));
    await flush();
    sent = sentCommands(socket);
    expect(sent[1].type).toBe(CommandType.COMMAND_GO_TO);
    expect(sent[1].goTo?.x).toBe(1);
    expect(sent[1].goTo?.heading).toBeCloseTo(Math.PI / 4);
    socket.deliver(replyFrame(sent[1].requestId, ReplyResult.RESULT_OK, 'on the way', GOAL));
    await done;
    expect(useTrip.getState()).toMatchObject({ picking: false, pin: null, goal: { x: 1, y: 1, id: GOAL } });
    expect(useActions.getState()).toMatchObject({ busy: null, notice: null });
  });

  it('goes straight to the goal when already navigating', async () => {
    const socket = connected('navigation');
    startPicking();
    placePin(-1, 0);
    const done = goToPin();
    const [first] = sentCommands(socket);
    expect(first.type).toBe(CommandType.COMMAND_GO_TO);
    expect(first.goTo?.heading).toBeCloseTo(Math.PI);
    socket.deliver(replyFrame(first.requestId, ReplyResult.RESULT_OK, 'on the way', GOAL));
    await done;
    expect(useTrip.getState().goal?.id).toEqual(GOAL);
  });

  it("shows the robot's reason when it will not switch, and sends no goal", async () => {
    const socket = connected('idle');
    startPicking();
    placePin(1, 1);
    const done = goToPin();
    const [first] = sentCommands(socket);
    socket.deliver(replyFrame(first.requestId, ReplyResult.RESULT_REFUSED, 'no saved map yet'));
    await done;
    expect(sentCommands(socket)).toHaveLength(1);
    expect(useActions.getState().notice).toEqual({ tone: 'error', title: "Couldn't start navigation", text: 'No saved map yet.' });
    expect(useTrip.getState().pin).toEqual({ x: 1, y: 1, problem: null }); // the pin stays, to try again
  });

  it('says at once when there is no route, and keeps the pin', async () => {
    const socket = connected('navigation');
    startPicking();
    placePin(1, 1);
    const done = goToPin();
    const [first] = sentCommands(socket);
    socket.deliver(replyFrame(first.requestId, ReplyResult.RESULT_REFUSED, 'no route to that spot: it is blocked'));
    await done;
    expect(useActions.getState()).toMatchObject({
      busy: null,
      notice: { tone: 'error', title: "Can't go there", text: 'No route to that spot: it is blocked.' },
    });
    expect(useTrip.getState()).toMatchObject({ picking: true, pin: { x: 1, y: 1 }, goal: null });
  });

  it('marks a pin where the robot cannot go, and does not send it', async () => {
    const socket = connected('navigation');
    socket.deliver(zonesFrame([{ name: 'stairwell', pointsCm: [-200, -200, -100, -200, -100, -100, -200, -100] }]));
    startPicking();
    placePin(2.32, 2.32);
    expect(useTrip.getState().pin?.problem).toBe("It's a wall or furniture");
    placePin(-1.5, -1.5);
    expect(useTrip.getState().pin?.problem).toBe("It's in a no-go zone (stairwell)");
    placePin(9, 9);
    expect(useTrip.getState().pin?.problem).toBe("It's outside the map");
    await goToPin();
    expect(sentCommands(socket)).toHaveLength(0);
    placePin(1, -1);
    expect(useTrip.getState().pin?.problem).toBeNull();
  });

  it('shows how the trip ended, once, for the trip this app sent', async () => {
    const socket = connected('navigation');
    startPicking();
    placePin(1, 1);
    const done = goToPin();
    socket.deliver(replyFrame(sentCommands(socket)[0].requestId, ReplyResult.RESULT_OK, 'on the way', GOAL));
    await done;
    socket.deliver(navigationFrame(GOAL, NavState.STATE_ON_THE_WAY, 1.2));
    expect(useActions.getState().notice).toBeNull();
    socket.deliver(navigationFrame(GOAL, NavState.STATE_FAILED));
    expect(useActions.getState().notice).toMatchObject({ tone: 'error', title: "Couldn't finish the trip" });
    expect(useTrip.getState().goal).toBeNull();
    useActions.setState({ notice: null });
    socket.deliver(navigationFrame(GOAL, NavState.STATE_FAILED)); // the gateway repeats the status
    expect(useActions.getState().notice).toBeNull();
  });

  it('says Arrived, and the card goes away by itself', async () => {
    const socket = connected('navigation');
    useTrip.setState({ goal: { id: GOAL, x: 1, y: 1 } });
    socket.deliver(navigationFrame(GOAL, NavState.STATE_REACHED));
    expect(useActions.getState().notice).toMatchObject({ tone: 'success', title: 'Arrived' });
    jest.advanceTimersByTime(SUCCESS_SHOWN_MS + 10);
    expect(useActions.getState().notice).toBeNull();
  });

  it("says nothing about someone else's trip", () => {
    const socket = connected('navigation');
    socket.deliver(navigationFrame(GOAL, NavState.STATE_FAILED));
    expect(useActions.getState().notice).toBeNull();
  });

  it('keeps the navigation status in the store', () => {
    const socket = connected('navigation');
    socket.deliver(navigationFrame(GOAL, NavState.STATE_ON_THE_WAY, 2.5));
    expect(useRobot.getState().navigation?.value).toEqual({ goalId: GOAL, state: 'on_the_way', distanceRemaining: 2.5 });
  });

  it('faces the way it is already facing when the goal is right under it', () => {
    expect(arrivalHeading(0, 0, 1.2, 0.05, 0)).toBe(1.2);
    expect(arrivalHeading(0, 0, 1.2, 0, 2)).toBeCloseTo(Math.PI / 2);
  });
});

describe('what the trip looks like', () => {
  const nav = (state: Parameters<typeof tripView>[0] extends infer N ? N : never) => state;
  const status = (s: 'accepted' | 'on_the_way' | 'cancelling' | 'reached' | 'failed' | 'cancelled', d = 0, at = 1000) =>
    nav({ value: { goalId: GOAL, state: s, distanceRemaining: d }, at });

  it('describes each state while navigating', () => {
    expect(tripView(status('accepted'), 'navigation', 1000)).toEqual({ active: true, text: 'Starting the trip…' });
    expect(tripView(status('on_the_way', 3.25), 'navigation', 1000)).toEqual({ active: true, text: 'On the way · 3.3 m left' });
    expect(tripView(status('reached'), 'navigation', 1000)).toEqual({ active: false, text: 'Arrived' });
    expect(tripView(status('failed'), 'navigation', 1000).text).toBe("Couldn't finish the trip");
    expect(tripView(status('cancelled'), 'navigation', 1000).text).toBe('Trip cancelled');
  });

  it('shows nothing outside navigation mode, or when the status is old', () => {
    expect(tripView(status('on_the_way', 2), 'docking', 1000)).toEqual({ active: false, text: null });
    expect(tripView(status('on_the_way', 2), 'navigation', 1000 + 5001)).toEqual({ active: false, text: null });
    expect(tripView(null, 'navigation', 1000)).toEqual({ active: false, text: null });
  });
});

describe('the Go to button', () => {
  const robot = (state: string, extra = {}) => ({
    state,
    previousState: '',
    reason: '',
    transitioning: false,
    allowedTransitions: ['idle', 'navigation', 'manual'],
    faults: [],
    currentMap: 'house',
    enteredTime: 0,
    makingMap: state === 'mapping' || state === 'exploring',
    ...extra,
  });

  it('is usable with a map, from idle or navigation', () => {
    expect(controlsFor(robot('idle'), true, true).goTo).toEqual({ enabled: true, hint: null });
    expect(controlsFor(robot('navigation', { allowedTransitions: ['idle'] }), true, true).goTo.enabled).toBe(true);
  });

  it('says why not', () => {
    expect(controlsFor(robot('idle', { currentMap: '' }), true, true).goTo).toEqual({ enabled: false, hint: 'Make a map first' });
    expect(controlsFor(robot('mapping'), true, true).goTo).toEqual({ enabled: false, hint: 'Not while mapping' });
    expect(controlsFor(robot('failsafe', { allowedTransitions: ['idle'] }), true, true).goTo).toEqual({ enabled: false, hint: 'Reset first' });
  });
});
