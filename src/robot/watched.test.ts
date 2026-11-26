import { useCleaning } from './cleaningStore';
import { initialRobotData, useRobot } from './store';
import { sameData, watch } from './watched';

beforeEach(() => {
  jest.useFakeTimers();
  useRobot.setState(initialRobotData);
});
afterEach(() => jest.useRealTimers());

const ping = () => useRobot.getState().pingMs;

describe('watch', () => {
  it('gives the value at once, then only when it changes', () => {
    const heard: Array<number | null> = [];
    const stop = watch(ping, (v) => heard.push(v));
    expect(heard).toEqual([null]);
    useRobot.setState({ route: { value: { poses: [] } as never, at: 1 } }); // the store changes often ...
    useRobot.setState({ route: { value: { poses: [] } as never, at: 2 } });
    expect(heard).toEqual([null]); // ... and what is watched did not
    useRobot.setState({ pingMs: 12 });
    expect(heard).toEqual([null, 12]);
    stop();
  });

  it('sees a value that changes with time alone', () => {
    const start = Date.now();
    const heard: boolean[] = [];
    const stop = watch(
      () => Date.now() - start < 2000, // fresh for two seconds, like a message from the robot
      (v) => heard.push(v),
    );
    jest.advanceTimersByTime(1500);
    expect(heard).toEqual([true]);
    jest.advanceTimersByTime(1000);
    expect(heard).toEqual([true, false]);
    stop();
  });

  it('counts values with the same content as unchanged', () => {
    const heard: unknown[] = [];
    const stop = watch(() => ({ ping: ping(), buttons: { stop: { enabled: true } } }), (v) => heard.push(v), sameData);
    useRobot.setState({ route: { value: { poses: [] } as never, at: 1 } }); // a new object each time, saying the same
    jest.advanceTimersByTime(2000);
    expect(heard).toHaveLength(1);
    useRobot.setState({ pingMs: 12 });
    expect(heard).toHaveLength(2);
    stop();
  });

  it('follows the cleaning store too', () => {
    const heard: boolean[] = [];
    const stop = watch(() => useCleaning.getState().status !== null, (v) => heard.push(v));
    useCleaning.setState({ status: { value: {} as never, at: 0 } });
    expect(heard).toEqual([false, true]);
    useCleaning.setState({ status: null });
    stop();
  });

  it('is silent once stopped', () => {
    const heard: Array<number | null> = [];
    watch(ping, (v) => heard.push(v))();
    useRobot.setState({ pingMs: 12 });
    jest.advanceTimersByTime(2000);
    expect(heard).toEqual([null]);
  });
});
