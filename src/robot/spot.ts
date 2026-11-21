// Can the robot go to a point? Checked the moment the user taps, from what the app already has:
// the map and the no-go zones. Plain data in, plain data out, tested without a screen.
//
// This catches the obvious cases at once. Whether a route exists (a closed door, a spot cut off
// by furniture) only the robot's planner knows: the gateway asks it before the robot moves.

import type { MapData, NoGoZone } from '../transport/messages';

/** A cell at least this occupied is a wall or furniture, as the robot's map server reads it. */
export const OCCUPIED_FROM = 65;

/** The map cell under a point (map coordinates), or null when the point is outside the map. */
export function cellAt(map: MapData, x: number, y: number): number | null {
  const dx = x - map.originX;
  const dy = y - map.originY;
  const c = Math.cos(map.originYaw);
  const s = Math.sin(map.originYaw);
  const col = Math.floor((c * dx + s * dy) / map.resolution);
  const row = Math.floor((-s * dx + c * dy) / map.resolution);
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) return null;
  return map.cells[row * map.width + col];
}

/** Is (x, y) inside the polygon? Corners as x0, y0, x1, y1, ... (ray casting). */
export function insidePolygon(points: ArrayLike<number>, x: number, y: number): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[2 * i];
    const yi = points[2 * i + 1];
    const xj = points[2 * j];
    const yj = points[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Why the robot cannot go to (x, y), in a few words for the user, or null when it may try. */
export function whyNotThere(map: MapData, zones: readonly NoGoZone[], x: number, y: number): string | null {
  for (const zone of zones) {
    if (insidePolygon(zone.points, x, y)) return zone.name ? `It's in a no-go zone (${zone.name})` : "It's in a no-go zone";
  }
  const cell = cellAt(map, x, y);
  if (cell === null) return "It's outside the map";
  if (cell < 0) return "That part hasn't been explored";
  if (cell >= OCCUPIED_FROM) return "It's a wall or furniture";
  return null;
}
