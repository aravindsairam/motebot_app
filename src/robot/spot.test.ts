import type { MapData } from '../transport/messages';
import { cellAt, insidePolygon, whyNotThere } from './spot';

// 4 x 3 cells of 0.5 m, from (-1, -1): row 0 is y in [-1, -0.5)
//   row 2:  free  free  wall  unknown
//   row 1:  free  free  free  free
//   row 0:  free  free  free  wall
const map: MapData = {
  version: 1,
  width: 4,
  height: 3,
  resolution: 0.5,
  originX: -1,
  originY: -1,
  originYaw: 0,
  cells: Int8Array.from([0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 100, -1]),
};
const square = { name: 'stairwell', points: Float32Array.from([-1, -1, -0.5, -1, -0.5, -0.5, -1, -0.5]) };

describe('can the robot go there', () => {
  it('finds the cell under a point', () => {
    expect(cellAt(map, -0.9, -0.9)).toBe(0);
    expect(cellAt(map, 0.6, -0.9)).toBe(100);
    expect(cellAt(map, 0.6, 0.1)).toBe(-1);
    expect(cellAt(map, -1.01, 0)).toBeNull();
    expect(cellAt(map, 1.01, 0)).toBeNull();
    expect(cellAt(map, 0, 0.51)).toBeNull();
  });

  it('finds the cell on a turned map', () => {
    const turned = { ...map, originX: 0, originY: 0, originYaw: Math.PI / 2 };
    // along the map's columns is +y in the world, along its rows is -x
    expect(cellAt(turned, -0.1, 1.9)).toBe(100); // row 0, col 3
    expect(cellAt(turned, 0.1, 1.0)).toBeNull();
  });

  it('knows inside a polygon from outside', () => {
    expect(insidePolygon(square.points, -0.75, -0.75)).toBe(true);
    expect(insidePolygon(square.points, -0.25, -0.75)).toBe(false);
    const triangle = [0, 0, 2, 0, 0, 2];
    expect(insidePolygon(triangle, 0.5, 0.5)).toBe(true);
    expect(insidePolygon(triangle, 1.5, 1.5)).toBe(false);
  });

  it('gives the reason in a few words', () => {
    expect(whyNotThere(map, [], -0.25, -0.25)).toBeNull();
    expect(whyNotThere(map, [], 0.6, -0.9)).toBe("It's a wall or furniture");
    expect(whyNotThere(map, [], 0.6, 0.1)).toBe("That part hasn't been explored");
    expect(whyNotThere(map, [], 3, 3)).toBe("It's outside the map");
    expect(whyNotThere(map, [square], -0.75, -0.75)).toBe("It's in a no-go zone (stairwell)");
    expect(whyNotThere(map, [{ ...square, name: '' }], -0.75, -0.75)).toBe("It's in a no-go zone");
  });
});
