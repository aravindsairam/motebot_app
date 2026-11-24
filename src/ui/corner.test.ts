import { cornerOrigin, nearestCorner, shownCorner } from './corner';

const stage = { width: 400, height: 700 };
const win = { width: 152, height: 114 };

test('each corner sits 12 px in from its sides, the top ones below the labels', () => {
  expect(cornerOrigin('bottomLeft', stage, win)).toEqual({ x: 12, y: 574 });
  expect(cornerOrigin('bottomRight', stage, win)).toEqual({ x: 236, y: 574 });
  expect(cornerOrigin('topLeft', stage, win)).toEqual({ x: 12, y: 64 });
  expect(cornerOrigin('topRight', stage, win)).toEqual({ x: 236, y: 64 });
});

test('a bottom corner follows the stage height', () => {
  expect(cornerOrigin('bottomLeft', { width: 400, height: 500 }, win).y).toBe(374);
});

test('a window let go goes to the corner of the half its middle is in', () => {
  expect(nearestCorner(300, 500, 0, 0, stage, win)).toBe('bottomRight');
  expect(nearestCorner(10, 60, 0, 0, stage, win)).toBe('topLeft');
});

test('a flick counts in its direction', () => {
  expect(nearestCorner(12, 52, 3000, 0, stage, win)).toBe('topRight'); // 450 px further right
  expect(nearestCorner(236, 574, 0, -4000, stage, win)).toBe('topRight');
});

test('a huge flick still gives a corner', () => {
  expect(nearestCorner(200, 300, -1e6, 1e6, stage, win)).toBe('bottomLeft');
});

test('the joystick keeps its corner', () => {
  expect(shownCorner('bottomRight', true)).toBe('bottomLeft');
  expect(shownCorner('bottomRight', false)).toBe('bottomRight');
  expect(shownCorner('topRight', true)).toBe('topRight');
});

test('a short stage keeps the window inside', () => {
  const short = { width: 400, height: 150 };
  for (const c of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const) {
    const o = cornerOrigin(c, short, win);
    expect(o.y).toBeGreaterThanOrEqual(0);
    expect(o.y + win.height).toBeLessThanOrEqual(150);
  }
});
