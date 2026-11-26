// The robot's position: it arrives twenty times a second, so it does not go through the store
// (which would redraw every screen that reads it). The map view subscribes and moves its
// drawing directly.

import type { Pose } from '../transport/messages';

type Listener<T> = (value: T) => void;

export class Live<T> {
  value: T | null = null;
  at = 0; // when it arrived, ms; 0 = never
  private listeners = new Set<Listener<T>>();

  set(value: T, at: number): void {
    this.value = value;
    this.at = at;
    for (const listener of this.listeners) listener(value);
  }

  /** Returns the function that unsubscribes. */
  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.value = null;
    this.at = 0;
  }
}

export const livePose = new Live<Pose>();

/** Has a recent position arrived? Older than this, the robot is drawn as "last seen". */
export const POSE_STALE_AFTER_MS = 1000;
