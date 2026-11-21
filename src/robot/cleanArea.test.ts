import {
  beginEdit,
  boxAround,
  boxCorners,
  boxFrom,
  boxTooSmall,
  continueEdit,
  EDIT_DRAW,
  EDIT_MOVE,
  EDIT_PAN,
  mapBoxToPicture,
  pictureBoxToMap,
  sameBox,
  screenDragToMap,
  screenToPicture,
  SPOT_SIZE_M,
} from './cleanArea';

// 100 cells high, 5 cm cells, the map's corner at (-2, -1)
const map = { height: 100, resolution: 0.05, originX: -2, originY: -1, originYaw: 0 };
// screen = picture * 2 + (10, 20)
const view = { scale: 2, tx: 10, ty: 20 };

function close(b: { x0: number; y0: number; x1: number; y1: number }, expected: number[]) {
  [b.x0, b.y0, b.x1, b.y1].forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
}

describe('rectangles', () => {
  it('are kept with the smaller corner first, whichever way they were dragged', () => {
    expect(boxFrom(3, 1, 1, 2)).toEqual({ x0: 1, y0: 1, x1: 3, y1: 2 });
    expect(boxFrom(1, 2, 3, 1)).toEqual({ x0: 1, y0: 1, x1: 3, y1: 2 });
  });

  it('give the job four corners, counter-clockwise on the map', () => {
    expect(boxCorners({ x0: 1.2, y0: 0.2, x1: 3.2, y1: 1.4 })).toEqual([1.2, 0.2, 3.2, 0.2, 3.2, 1.4, 1.2, 1.4]);
  });

  it('a spot is a square of the robot spot size around the point', () => {
    expect(boxAround(2.5, -1.25, SPOT_SIZE_M)).toEqual({ x0: 1.75, y0: -2, x1: 3.25, y1: -0.5 });
  });

  it('knows a slip of the finger from an area', () => {
    expect(boxTooSmall({ x0: 0, y0: 0, x1: 0.2, y1: 2 })).toBe(true);
    expect(boxTooSmall({ x0: 0, y0: 0, x1: 2, y1: 0.29 })).toBe(true);
    expect(boxTooSmall({ x0: 0, y0: 0, x1: 0.3, y1: 0.3 })).toBe(false);
  });

  it('compares', () => {
    expect(sameBox(null, null)).toBe(true);
    expect(sameBox(null, boxFrom(0, 0, 1, 1))).toBe(false);
    expect(sameBox(boxFrom(0, 0, 1, 1), boxFrom(1, 1, 0, 0))).toBe(true);
  });
});

describe('from the screen to the map', () => {
  it('turns a screen point into a picture point', () => {
    expect(screenToPicture(view, 110, 220)).toEqual({ px: 50, py: 100 });
  });

  it('turns a rectangle dragged on the screen into metres on the map, +y up', () => {
    // from (110, 220) to (210, 120) on the screen: picture (50, 100) to (100, 50)
    close(screenDragToMap(map, view, 110, 220, 210, 120), [0.5, -1, 3, 1.5]);
    // dragged the other way: the same rectangle
    close(screenDragToMap(map, view, 210, 120, 110, 220), [0.5, -1, 3, 1.5]);
  });

  it('goes from the map to the picture and back', () => {
    const area = { x0: 1.2, y0: 0.2, x1: 3.2, y1: 1.4 };
    const pic = mapBoxToPicture(map, area);
    close(pic, [64, 52, 104, 76]); // y flipped: the top of the area is the smaller picture row
    close(pictureBoxToMap(map, pic), [1.2, 0.2, 3.2, 1.4]);
  });
});

describe('dragging an area on the picture', () => {
  const b = { x0: 10, y0: 10, x1: 50, y1: 30 };

  it('draws a new one when there is none', () => {
    const start = beginEdit(null, 5, 6, 3);
    expect(start).toEqual({ kind: EDIT_DRAW, ax: 5, ay: 6 });
    expect(continueEdit(null, start, 20, 2, 15, -4)).toEqual({ x0: 5, y0: 2, x1: 20, y1: 6 });
  });

  it('takes the corner under the finger: the opposite one stays, and it may be dragged past it', () => {
    const start = beginEdit(b, 49, 31, 3); // near (x1, y1)
    expect(start).toEqual({ kind: EDIT_DRAW, ax: 10, ay: 10 });
    expect(continueEdit(b, start, 60, 40, 11, 9)).toEqual({ x0: 10, y0: 10, x1: 60, y1: 40 });
    expect(continueEdit(b, start, 0, 5, -60, -35)).toEqual({ x0: 0, y0: 5, x1: 10, y1: 10 });
  });

  it('takes the nearest corner when two are within reach', () => {
    const small = { x0: 0, y0: 0, x1: 2, y1: 2 };
    expect(beginEdit(small, 1.8, 0.1, 5)).toEqual({ kind: EDIT_DRAW, ax: 0, ay: 2 }); // (x1, y0) taken
  });

  it('moves it when the finger lands inside', () => {
    const start = beginEdit(b, 30, 20, 3);
    expect(start.kind).toBe(EDIT_MOVE);
    expect(continueEdit(b, start, 33, 18, 3, -2)).toEqual({ x0: 13, y0: 8, x1: 53, y1: 28 });
  });

  it('leaves it alone, and moves the map, when the finger lands elsewhere', () => {
    const start = beginEdit(b, 80, 80, 3);
    expect(start.kind).toBe(EDIT_PAN);
    expect(continueEdit(b, start, 90, 90, 10, 10)).toBe(b);
  });
});
