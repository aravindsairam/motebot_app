import { cellsToRgba, fitView, fromPicture, toPicture, zoomAbout } from './mapPicture';

describe('the map as a picture', () => {
  it('turns the map upside down so that +y is up, and colours the cells', () => {
    // 2 x 2 map: bottom row (row 0) unknown, free; top row occupied, half
    const rgba = cellsToRgba({ cells: Int8Array.from([-1, 0, 100, 50]), width: 2, height: 2 });
    const pixel = (i: number) => [...rgba.subarray(i * 4, i * 4 + 4)];
    expect(pixel(0)).toEqual([31, 41, 55, 255]); // top-left of the picture: occupied (map row 1)
    expect(pixel(1)).toEqual([143, 148, 155, 255]); // top-right: half way to occupied
    expect(pixel(2)).toEqual([214, 218, 224, 255]); // bottom-left: unknown (map row 0)
    expect(pixel(3)).toEqual([255, 255, 255, 255]); // bottom-right: free
  });
});

describe('map, picture and screen coordinates', () => {
  const map = { height: 100, resolution: 0.05, originX: -2, originY: -1, originYaw: 0 };

  it('places the map origin at the bottom-left corner of the picture', () => {
    expect(toPicture(map, -2, -1)).toEqual({ px: 0, py: 100 });
    const p = toPicture(map, 0.5, 1.5);
    expect(p.px).toBeCloseTo(50);
    expect(p.py).toBeCloseTo(50);
  });

  it('goes back and forth, also for a rotated map', () => {
    for (const m of [map, { ...map, originYaw: 0.7 }]) {
      const p = toPicture(m, 1.234, -0.56);
      const back = fromPicture(m, p.px, p.py);
      expect(back.x).toBeCloseTo(1.234, 9);
      expect(back.y).toBeCloseTo(-0.56, 9);
    }
  });

  it('fits the whole picture, centred', () => {
    const v = fitView(200, 100, 400, 400, 1);
    expect(v).toEqual({ scale: 2, tx: 0, ty: 100 });
  });

  it('zooms about the fingers: the point under them stays put', () => {
    const before = { scale: 2, tx: 10, ty: 20 };
    const after = zoomAbout(before, 1.5, 110, 220, 0.1, 40);
    const under = (v: typeof before, sx: number, sy: number) => [(sx - v.tx) / v.scale, (sy - v.ty) / v.scale];
    expect(under(after, 110, 220)[0]).toBeCloseTo(under(before, 110, 220)[0]);
    expect(under(after, 110, 220)[1]).toBeCloseTo(under(before, 110, 220)[1]);
    expect(after.scale).toBe(3);
  });

  it('keeps the zoom within its limits', () => {
    expect(zoomAbout({ scale: 30, tx: 0, ty: 0 }, 5, 0, 0, 0.1, 40).scale).toBe(40);
    expect(zoomAbout({ scale: 0.2, tx: 0, ty: 0 }, 0.1, 0, 0, 0.1, 40).scale).toBe(0.1);
  });
});
