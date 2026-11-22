// A place the robot pointed to in an answer: "Show on map" draws it on the Home tab's map until
// the user taps the map, or for a minute. No imports but zustand, so the client can clear it on
// disconnect without an import cycle.

import { create } from 'zustand';

export const MARK_SHOWN_MS = 60_000;

export interface MapMark {
  x: number; // metres, map coordinates
  y: number;
  id: number; // a new one for each time it is shown, so the map can bring it into view once
}

export const useMark = create<{ mark: MapMark | null }>(() => ({ mark: null }));

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let lastId = 0;

export function showMark(x: number, y: number): void {
  if (hideTimer !== null) clearTimeout(hideTimer);
  const mark = { x, y, id: ++lastId };
  useMark.setState({ mark });
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (useMark.getState().mark === mark) useMark.setState({ mark: null });
  }, MARK_SHOWN_MS);
}

export function clearMark(): void {
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = null;
  if (useMark.getState().mark !== null) useMark.setState({ mark: null });
}
