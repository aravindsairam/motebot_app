// The cleaned floor as a picture to lay over the map: one pixel per cell, tinted where the robot
// has cleaned and transparent elsewhere, rows flipped like the map's (+y up). Plain numbers, so it
// is tested without a phone.

import type { CleanedArea } from '../transport/messages';
import { type MapPlacement, toPicture } from './mapPicture';

/** The tint: the cleaning mode's colour, a little under half opaque so the map shows through. */
export const CLEANED_TINT = [8, 145, 178, 110];

/** RGBA pixels, not premultiplied: the tint on cleaned cells, nothing on the others. */
export function cleanedToRgba(area: Pick<CleanedArea, 'cells' | 'width' | 'height'>): Uint8Array {
  const { cells, width, height } = area;
  const out = new Uint8Array(width * height * 4); // all transparent
  for (let row = 0; row < height; row++) {
    const src = row * width;
    const dst = (height - 1 - row) * width;
    for (let col = 0; col < width; col++) {
      if (cells[src + col] > 0) {
        const o = (dst + col) * 4;
        out[o] = CLEANED_TINT[0];
        out[o + 1] = CLEANED_TINT[1];
        out[o + 2] = CLEANED_TINT[2];
        out[o + 3] = CLEANED_TINT[3];
      }
    }
  }
  return out;
}

/** Where the cleaned picture goes on the map's picture (cells, y down). The robot sends it the same
 *  size and place as the map; if a new map has come since, it is still put where it belongs. */
export function overlayPlacement(
  map: MapPlacement,
  grid: Pick<CleanedArea, 'width' | 'height' | 'resolution' | 'originX' | 'originY'>,
): { x: number; y: number; width: number; height: number } {
  const topLeft = toPicture(map, grid.originX, grid.originY + grid.height * grid.resolution);
  const k = grid.resolution / map.resolution;
  return { x: topLeft.px, y: topLeft.py, width: grid.width * k, height: grid.height * k };
}
