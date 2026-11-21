// The map as a picture, and the arithmetic between the map, the picture and the screen. No
// React, no drawing library: plain numbers, so it is tested without a phone.
//
// The picture has one pixel per map cell, row 0 at the top. Map rows go up in y, so the picture
// is the map turned upside down: the robot's "north" (+y) is up on the screen.
//
// The screen shows the picture scaled and moved: screen = picture * scale + (tx, ty).

import type { MapData } from '../transport/messages';

const UNKNOWN = [214, 218, 224];
const FREE = [255, 255, 255];
const OCCUPIED = [31, 41, 55];

/** RGBA pixels for the map, rows flipped so that +y is up. */
export function cellsToRgba(map: Pick<MapData, 'cells' | 'width' | 'height'>): Uint8Array {
  const { cells, width, height } = map;
  const out = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const src = row * width;
    const dst = (height - 1 - row) * width;
    for (let col = 0; col < width; col++) {
      const v = cells[src + col];
      const o = (dst + col) * 4;
      if (v < 0) {
        out[o] = UNKNOWN[0];
        out[o + 1] = UNKNOWN[1];
        out[o + 2] = UNKNOWN[2];
      } else {
        const t = Math.min(v, 100) / 100;
        out[o] = Math.round(FREE[0] + (OCCUPIED[0] - FREE[0]) * t);
        out[o + 1] = Math.round(FREE[1] + (OCCUPIED[1] - FREE[1]) * t);
        out[o + 2] = Math.round(FREE[2] + (OCCUPIED[2] - FREE[2]) * t);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

export type MapPlacement = Pick<MapData, 'height' | 'resolution' | 'originX' | 'originY' | 'originYaw'>;

/** A point in map coordinates (metres) to picture coordinates (cells, y down). */
export function toPicture(map: MapPlacement, x: number, y: number): { px: number; py: number } {
  'worklet';
  const dx = x - map.originX;
  const dy = y - map.originY;
  const c = Math.cos(map.originYaw);
  const s = Math.sin(map.originYaw);
  const mx = c * dx + s * dy;
  const my = -s * dx + c * dy;
  return { px: mx / map.resolution, py: map.height - my / map.resolution };
}

/** A heading in map coordinates to an angle on the picture (clockwise, because y is flipped). */
export function angleOnPicture(map: MapPlacement, heading: number): number {
  'worklet';
  return -(heading - map.originYaw);
}

/** A point on the picture (cells) back to map coordinates (metres). */
export function fromPicture(map: MapPlacement, px: number, py: number): { x: number; y: number } {
  const mx = px * map.resolution;
  const my = (map.height - py) * map.resolution;
  const c = Math.cos(map.originYaw);
  const s = Math.sin(map.originYaw);
  return { x: map.originX + c * mx - s * my, y: map.originY + s * mx + c * my };
}

export interface View {
  scale: number; // screen pixels per picture pixel
  tx: number;
  ty: number;
}

/** The whole picture, centred, filling `share` of the smaller side of the screen area. */
export function fitView(pictureW: number, pictureH: number, viewW: number, viewH: number, share = 0.94): View {
  const scale = Math.min(viewW / pictureW, viewH / pictureH) * share;
  return { scale, tx: (viewW - pictureW * scale) / 2, ty: (viewH - pictureH * scale) / 2 };
}

/** Zoom by `factor` keeping the screen point (fx, fy) still; scale kept within [min, max]. */
export function zoomAbout(view: View, factor: number, fx: number, fy: number, min: number, max: number): View {
  'worklet';
  const scale = Math.min(max, Math.max(min, view.scale * factor));
  const k = scale / view.scale;
  return { scale, tx: fx - (fx - view.tx) * k, ty: fy - (fy - view.ty) * k };
}
