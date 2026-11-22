import { toPicture } from './mapPicture';
import {
  ANGLE_STEP,
  angleText,
  canStep,
  rangesFrom,
  rowsTurnOnScreen,
  spacingText,
  SPEED_STEP,
  speedText,
  stepAngle,
  stepValue,
  wrapAngle,
} from './settingsSteps';

const f = Math.fround; // a number as it arrives from the robot: a 32-bit float

// The robot's own limits, as they arrive.
const LIMITS = {
  cleaningSpeedMin: f(0.1),
  cleaningSpeedMax: f(0.3),
  manualSpeedMin: f(0.1),
  manualSpeedMax: f(0.3),
  rowSpacingMin: f(0.1),
  rowSpacingMax: f(0.3),
  rowSpacingStep: f(0.05),
};
const SPEED = rangesFrom(LIMITS).cleaningSpeed;
const SPACING = rangesFrom(LIMITS).rowSpacing;

describe('plus and minus on a speed', () => {
  it('move by 0.05 m/s', () => {
    expect(SPEED.step).toBe(SPEED_STEP);
    expect(stepValue(0.2, 1, SPEED)).toBe(0.25);
    expect(stepValue(0.2, -1, SPEED)).toBe(0.15);
  });

  it('take a value as it arrives from the robot, noise and all', () => {
    expect(f(0.2)).not.toBe(0.2);
    expect(stepValue(f(0.2), 1, SPEED)).toBe(0.25);
    expect(stepValue(f(0.2), -1, SPEED)).toBe(0.15);
    expect(stepValue(f(0.15), 1, SPEED)).toBe(0.2); // 0.15 arrives as a little more than 0.15
    expect(stepValue(f(0.25), -1, SPEED)).toBe(0.2);
  });

  it('walk every step from one limit to the other and back', () => {
    const up: string[] = [];
    let v: number = LIMITS.cleaningSpeedMin;
    for (let i = 0; i < 10 && canStep(v, 1, SPEED); i++) {
      v = stepValue(v, 1, SPEED);
      up.push(speedText(v));
    }
    expect(up).toEqual(['0.15 m/s', '0.20 m/s', '0.25 m/s', '0.30 m/s']);
    const down: string[] = [];
    for (let i = 0; i < 10 && canStep(v, -1, SPEED); i++) {
      v = stepValue(v, -1, SPEED);
      down.push(speedText(v));
    }
    expect(down).toEqual(['0.25 m/s', '0.20 m/s', '0.15 m/s', '0.10 m/s']);
  });

  it('stop at the limits', () => {
    expect(canStep(f(0.3), 1, SPEED)).toBe(false);
    expect(stepValue(f(0.3), 1, SPEED)).toBe(f(0.3));
    expect(canStep(f(0.3), -1, SPEED)).toBe(true);
    expect(canStep(f(0.1), -1, SPEED)).toBe(false);
    expect(stepValue(f(0.1), -1, SPEED)).toBe(f(0.1));
    expect(canStep(f(0.1), 1, SPEED)).toBe(true);
  });

  it('from a value between two steps, go to the next step that way', () => {
    expect(stepValue(0.22, 1, SPEED)).toBe(0.25);
    expect(stepValue(0.22, -1, SPEED)).toBe(0.2);
    expect(stepValue(0.2499, 1, SPEED)).toBe(0.25);
    expect(stepValue(0.2501, -1, SPEED)).toBe(0.25);
  });

  it('never leave the limits, even when a limit is between two steps', () => {
    const odd = { min: 0.125, max: 0.3125, step: SPEED_STEP };
    expect(stepValue(0.3, 1, odd)).toBe(0.3125); // the next step would be 0.35
    expect(canStep(0.3125, 1, odd)).toBe(false);
    expect(stepValue(0.3125, -1, odd)).toBe(0.3);
    expect(stepValue(0.15, -1, odd)).toBe(0.125); // the next step would be 0.10
    expect(canStep(0.125, -1, odd)).toBe(false);
    expect(stepValue(0.125, 1, odd)).toBe(0.15);
  });

  it('bring a value from outside the limits back inside', () => {
    expect(stepValue(0.5, -1, SPEED)).toBe(f(0.3));
    expect(canStep(0.5, 1, SPEED)).toBe(false);
    expect(stepValue(0.02, 1, SPEED)).toBe(f(0.1));
    expect(canStep(0.02, -1, SPEED)).toBe(false);
  });

  it('do nothing without limits (a robot that sent none) or with a value that is not a number', () => {
    const none = { min: 0, max: 0, step: SPEED_STEP };
    expect(canStep(0.2, 1, none)).toBe(false);
    expect(canStep(0.2, -1, none)).toBe(false);
    expect(stepValue(0.2, 1, none)).toBe(0.2);
    expect(canStep(NaN, 1, SPEED)).toBe(false);
    expect(canStep(0.2, 1, { min: 0.1, max: 0.3, step: 0 })).toBe(false);
  });
});

describe('plus and minus on the row spacing', () => {
  it("move by the robot's own step, which arrives as a 32-bit float", () => {
    expect(SPACING.step).toBe(0.05);
    expect(stepValue(f(0.25), 1, SPACING)).toBe(0.3);
    expect(stepValue(f(0.25), -1, SPACING)).toBe(0.2);
    expect(canStep(0.3, 1, SPACING)).toBe(false);
    expect(canStep(f(0.1), -1, SPACING)).toBe(false);
  });

  it('follow a different step when the robot sends one', () => {
    const range = rangesFrom({ ...LIMITS, rowSpacingMin: 0.125, rowSpacingMax: 0.5, rowSpacingStep: 0.0625 }).rowSpacing;
    expect(stepValue(0.25, 1, range)).toBe(0.3125);
    expect(stepValue(0.25, -1, range)).toBe(0.1875);
    expect(stepValue(0.2, 1, range)).toBe(0.25); // between two steps
  });
});

describe('the row angle', () => {
  it('moves by 5 degrees', () => {
    expect(ANGLE_STEP).toBe(5);
    expect(stepAngle(45, 1)).toBe(50);
    expect(stepAngle(45, -1)).toBe(40);
  });

  it('goes round: plus at 175 gives 0, minus at 0 gives 175', () => {
    expect(stepAngle(175, 1)).toBe(0);
    expect(stepAngle(0, -1)).toBe(175);
    expect(stepAngle(0, 1)).toBe(5);
    expect(stepAngle(175, -1)).toBe(170);
  });

  it('visits every step once in a full round, each way', () => {
    const all = Array.from({ length: 36 }, (_, i) => i * 5);
    let a = 0;
    const up = all.map(() => (a = stepAngle(a, 1)));
    expect([...up].sort((x, y) => x - y)).toEqual(all);
    expect(a).toBe(0);
    const down = all.map(() => (a = stepAngle(a, -1)));
    expect([...down].sort((x, y) => x - y)).toEqual(all);
    expect(a).toBe(0);
  });

  it('from an angle between two steps, goes to the next step that way', () => {
    expect(stepAngle(37.5, 1)).toBe(40);
    expect(stepAngle(37.5, -1)).toBe(35);
    expect(stepAngle(177, 1)).toBe(0);
    expect(stepAngle(177, -1)).toBe(175);
    expect(stepAngle(2, -1)).toBe(0);
    expect(stepAngle(f(44.99999), 1)).toBe(50); // 45 with noise is 45
  });

  it('takes an angle from outside 0 to 180 as the same rows', () => {
    expect(wrapAngle(180)).toBe(0);
    expect(wrapAngle(190)).toBe(10);
    expect(wrapAngle(-5)).toBe(175);
    expect(wrapAngle(-180)).toBe(0);
    expect(wrapAngle(NaN)).toBe(0);
    expect(stepAngle(190, 1)).toBe(15);
    expect(stepAngle(-5, 1)).toBe(0);
    expect(stepAngle(180, -1)).toBe(175);
  });
});

describe('how the values are shown', () => {
  it('a speed with two decimals', () => {
    expect(speedText(0.2)).toBe('0.20 m/s');
    expect(speedText(f(0.2))).toBe('0.20 m/s');
    expect(speedText(f(0.15))).toBe('0.15 m/s');
    expect(speedText(0.3)).toBe('0.30 m/s');
  });

  it('a speed between two hundredths as it is, not rounded to a step', () => {
    expect(speedText(0.125)).toBe('0.125 m/s');
    expect(speedText(0.22)).toBe('0.22 m/s');
    expect(speedText(f(0.237))).toBe('0.237 m/s');
  });

  it('a row spacing in centimetres', () => {
    expect(spacingText(0.25)).toBe('25 cm');
    expect(spacingText(f(0.25))).toBe('25 cm');
    expect(spacingText(f(0.3))).toBe('30 cm');
    expect(spacingText(f(0.1))).toBe('10 cm');
    expect(spacingText(0.1875)).toBe('18.8 cm');
    expect(spacingText(0.123)).toBe('12.3 cm');
  });

  it('an angle in degrees', () => {
    expect(angleText(45)).toBe('45°');
    expect(angleText(0)).toBe('0°');
    expect(angleText(175)).toBe('175°');
    expect(angleText(37.5)).toBe('37.5°');
    expect(angleText(f(44.99999))).toBe('45°');
    expect(angleText(185)).toBe('5°');
    expect(angleText(179.99)).toBe('0°');
  });

  it('a dash for a value that is not a number', () => {
    expect(speedText(NaN)).toBe('-');
    expect(spacingText(Infinity)).toBe('-');
    expect(angleText(NaN)).toBe('-');
  });
});

describe('the drawing of the rows', () => {
  it('lies level at 0, climbs to the right at 45, stands upright at 90', () => {
    expect(rowsTurnOnScreen(0)).toBe(0);
    expect(rowsTurnOnScreen(45)).toBe(-45); // a turn to the left on the screen
    expect(rowsTurnOnScreen(90)).toBe(-90);
    expect(rowsTurnOnScreen(180)).toBe(0);
  });

  it('is turned the way a row at that angle is drawn on the map', () => {
    const map = { height: 200, resolution: 0.05, originX: -3, originY: -2, originYaw: 0 };
    for (const angle of [0, 5, 30, 45, 90, 120, 135, 175]) {
      // a row through the room at `angle` from the map's x axis, as the map view draws it
      const rad = (angle * Math.PI) / 180;
      const a = toPicture(map, 1, 1);
      const b = toPicture(map, 1 + Math.cos(rad), 1 + Math.sin(rad));
      const onMap = (Math.atan2(b.py - a.py, b.px - a.px) * 180) / Math.PI; // clockwise on the screen: y runs down
      // the drawing: a level line, turned clockwise by this much
      const drawn = rowsTurnOnScreen(angle);
      expect(wrapAngle(onMap - drawn)).toBeCloseTo(0, 6); // the same line: equal, or half a turn apart
    }
  });
});
