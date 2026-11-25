// A value worked out from what the robot last said and from the time, such as "is its state
// fresh" or "which buttons are usable". The robot's messages arrive many times a second and such a
// value changes rarely, so a screen that shows it is told only when it changes, and redraws only
// then.

import { useEffect, useState } from 'react';

import { useCleaning } from './cleaningStore';
import { useRobot } from './store';

const TICK_MS = 500; // how often time alone is looked at (a message going stale)

type Same<T> = (a: T, b: T) => boolean;

/** Plain data (numbers, text, lists, objects of these) that says the same. */
export function sameData(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Follow `compute`, which reads the stores (getState) and the clock. `onChange` gets the value at
 * once, and again whenever it has changed. Returns the function that stops it.
 */
export function watch<T>(compute: () => T, onChange: (value: T) => void, same: Same<T> = Object.is): () => void {
  let last = compute();
  onChange(last);
  const look = () => {
    const next = compute();
    if (same(last, next)) return;
    last = next;
    onChange(next);
  };
  const leaveRobot = useRobot.subscribe(look);
  const leaveCleaning = useCleaning.subscribe(look);
  const timer = setInterval(look, TICK_MS);
  return () => {
    leaveRobot();
    leaveCleaning();
    clearInterval(timer);
  };
}

/**
 * The value of `compute` for a screen, which redraws only when it changes. `compute` must not
 * depend on the screen's own properties or state: it is the first one given that is followed.
 */
export function useWatched<T>(compute: () => T, same: Same<T> = Object.is): T {
  const [value, setValue] = useState(compute);
  useEffect(
    () => watch(compute, (next) => setValue((old) => (same(old, next) ? old : next)), same),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return value;
}
