// Where the main screen's small corner window sits. It is dragged with a finger and, when let go,
// glides to one of the four corners: the corner of the half its middle is in, after a short look
// ahead along a flick. The top corners sit below the top row of labels (the mode label, Fit), and
// the joystick's corner is given up while the joystick shows. Every function here also runs on
// the UI thread, inside the drag gesture ('worklet').

export type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface Size {
  width: number;
  height: number;
}

export const CORNER_MARGIN = 12; // px from the stage's sides (theme spacing.m)
export const TOP_INSET = 52; // px: below the map's top row of labels (12 from the top, about 32 high)
export const FLICK_TIME = 0.15; // s: a flick carries the window this far ahead at its speed

function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

/** The window's top-left corner when it sits in `corner`: always inside the stage. */
export function cornerOrigin(corner: Corner, stage: Size, win: Size): { x: number; y: number } {
  'worklet';
  const left = corner === 'topLeft' || corner === 'bottomLeft';
  const top = corner === 'topLeft' || corner === 'topRight';
  const x = left ? CORNER_MARGIN : stage.width - win.width - CORNER_MARGIN;
  const y = top ? TOP_INSET : stage.height - win.height - CORNER_MARGIN;
  return { x: clamp(x, 0, stage.width - win.width), y: clamp(y, 0, stage.height - win.height) };
}

/** The corner for a window let go with its top-left at (x, y), moving at (vx, vy) px/s. */
export function nearestCorner(x: number, y: number, vx: number, vy: number, stage: Size, win: Size): Corner {
  'worklet';
  const cx = x + win.width / 2 + vx * FLICK_TIME;
  const cy = y + win.height / 2 + vy * FLICK_TIME;
  const left = cx < stage.width / 2;
  if (cy < stage.height / 2) return left ? 'topLeft' : 'topRight';
  return left ? 'bottomLeft' : 'bottomRight';
}

/** The corner the window is shown in: the joystick keeps the bottom right while it shows. */
export function shownCorner(wanted: Corner, joystickShown: boolean): Corner {
  'worklet';
  return joystickShown && wanted === 'bottomRight' ? 'bottomLeft' : wanted;
}
