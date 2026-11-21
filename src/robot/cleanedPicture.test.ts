import { CLEANED_TINT, cleanedToRgba, overlayPlacement } from './cleanedPicture';

describe('the cleaned floor as a picture', () => {
  it('tints only the cleaned cells, turned upside down like the map', () => {
    // 2 x 2: bottom row (row 0) not cleaned, cleaned; top row not cleaned, not cleaned
    const rgba = cleanedToRgba({ cells: Int8Array.from([0, 100, 0, 0]), width: 2, height: 2 });
    const pixel = (i: number) => [...rgba.subarray(i * 4, i * 4 + 4)];
    expect(pixel(0)).toEqual([0, 0, 0, 0]); // top-left: map row 1
    expect(pixel(1)).toEqual([0, 0, 0, 0]);
    expect(pixel(2)).toEqual([0, 0, 0, 0]); // bottom-left: map row 0, not cleaned
    expect(pixel(3)).toEqual(CLEANED_TINT); // bottom-right: cleaned
  });

  it('is laid exactly over the map when it has the map size and place', () => {
    const map = { height: 100, resolution: 0.05, originX: -2, originY: -1, originYaw: 0 };
    const at = overlayPlacement(map, { width: 80, height: 100, resolution: 0.05, originX: -2, originY: -1 });
    expect(at.x).toBeCloseTo(0, 9);
    expect(at.y).toBeCloseTo(0, 9);
    expect(at.width).toBeCloseTo(80, 9);
    expect(at.height).toBeCloseTo(100, 9);
  });

  it('is put where it belongs when it differs from the map', () => {
    const map = { height: 100, resolution: 0.05, originX: -2, originY: -1, originYaw: 0 };
    // 10 x 10 cells of 10 cm from (0, 0): 1 m square from (0, 0) to (1, 1)
    const at = overlayPlacement(map, { width: 10, height: 10, resolution: 0.1, originX: 0, originY: 0 });
    expect(at.x).toBeCloseTo(40, 9);
    expect(at.y).toBeCloseTo(60, 9); // its top, y = 1 m, is 2 m above the map's bottom: 100 - 40 cells
    expect(at.width).toBeCloseTo(20, 9);
    expect(at.height).toBeCloseTo(20, 9);
  });
});
