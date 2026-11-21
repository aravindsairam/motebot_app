// The area and the spot the user marks on the map, and the arithmetic between the screen, the
// map picture and the map. Plain numbers, so it is tested without a phone. The functions marked
// 'worklet' also run on the UI thread, inside the map's drag gesture, so the rectangle follows the
// finger without waiting for JavaScript.
//
// An area is a rectangle along the map's axes, the way a finger drags it. While it is being
// dragged it lives on the picture (cells, y down); the job sends its four corners in metres.

import type { View } from './mapPicture';
import { fromPicture, type MapPlacement, toPicture } from './mapPicture';

/** A rectangle along the axes: x0 <= x1 and y0 <= y1. Metres on the map, or cells on the picture. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const SPOT_SIZE_M = 1.5; // the robot's spot_size: a spot clean is a square this wide around the point
export const NEW_AREA_SIZE_M = 2; // a tap with no area yet places one this big
export const MIN_AREA_SIDE_M = 0.3; // narrower than this is a slip of the finger, not an area

/** The rectangle with corners (ax, ay) and (bx, by), in either order. */
export function boxFrom(ax: number, ay: number, bx: number, by: number): Box {
  'worklet';
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

/** A square `size` wide centred on (x, y). */
export function boxAround(x: number, y: number, size: number): Box {
  'worklet';
  const h = size / 2;
  return { x0: x - h, y0: y - h, x1: x + h, y1: y + h };
}

/** The four corners x0, y0, x1, y1, ... counter-clockwise on the map, as a job's area. */
export function boxCorners(b: Box): number[] {
  return [b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1];
}

export function boxTooSmall(b: Box): boolean {
  return b.x1 - b.x0 < MIN_AREA_SIDE_M || b.y1 - b.y0 < MIN_AREA_SIDE_M;
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/** A point on the screen (inside the map view) to the picture. screen = picture * scale + (tx, ty). */
export function screenToPicture(view: View, sx: number, sy: number): { px: number; py: number } {
  'worklet';
  return { px: (sx - view.tx) / view.scale, py: (sy - view.ty) / view.scale };
}

/** A rectangle on the map (metres) to the picture (cells, y down). */
export function mapBoxToPicture(map: MapPlacement, b: Box): Box {
  const p = toPicture(map, b.x0, b.y0);
  const q = toPicture(map, b.x1, b.y1);
  return boxFrom(p.px, p.py, q.px, q.py);
}

/** A rectangle on the picture back to the map (metres). */
export function pictureBoxToMap(map: MapPlacement, b: Box): Box {
  const p = fromPicture(map, b.x0, b.y0);
  const q = fromPicture(map, b.x1, b.y1);
  return boxFrom(p.x, p.y, q.x, q.y);
}

/** A rectangle dragged on the screen from (ax, ay) to (bx, by), on the map (metres). */
export function screenDragToMap(map: MapPlacement, view: View, ax: number, ay: number, bx: number, by: number): Box {
  const a = screenToPicture(view, ax, ay);
  const b = screenToPicture(view, bx, by);
  return pictureBoxToMap(map, boxFrom(a.px, a.py, b.px, b.py));
}

// What a drag on the map does while an area is being marked, decided where the finger lands:
export const EDIT_PAN = 0; // move the map, as at any other time
export const EDIT_DRAW = 1; // one corner stays at (ax, ay), the other follows the finger
export const EDIT_MOVE = 2; // the whole rectangle follows the finger

export interface EditStart {
  kind: number; // EDIT_PAN, EDIT_DRAW or EDIT_MOVE
  ax: number; // EDIT_DRAW: the corner that stays put
  ay: number;
}

/**
 * The finger lands at (px, py) on the picture. With no rectangle yet, the drag draws one. Near a
 * corner (within `reach`), it drags that corner: the opposite corner stays. Inside, it moves the
 * rectangle. Anywhere else, it moves the map.
 */
export function beginEdit(b: Box | null, px: number, py: number, reach: number): EditStart {
  'worklet';
  if (b === null) return { kind: EDIT_DRAW, ax: px, ay: py };
  const xs = [b.x0, b.x1];
  const ys = [b.y0, b.y1];
  let best = reach;
  let start: EditStart | null = null;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const d = Math.hypot(px - xs[i], py - ys[j]);
      if (d <= best) {
        best = d;
        start = { kind: EDIT_DRAW, ax: xs[1 - i], ay: ys[1 - j] };
      }
    }
  }
  if (start !== null) return start;
  if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) return { kind: EDIT_MOVE, ax: 0, ay: 0 };
  return { kind: EDIT_PAN, ax: 0, ay: 0 };
}

/** The rectangle once the finger is at (px, py), having moved (dx, dy) since the last update. */
export function continueEdit(b: Box | null, start: EditStart, px: number, py: number, dx: number, dy: number): Box | null {
  'worklet';
  if (start.kind === EDIT_DRAW) return boxFrom(start.ax, start.ay, px, py);
  if (start.kind === EDIT_MOVE && b !== null) return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy };
  return b;
}
