// The settings' controls as plain arithmetic: what plus and minus do to a value, how a value is
// shown, and how the small drawing of the rows is turned. No React and no store, so it is tested
// without a phone.
//
// The robot's numbers travel as 32-bit floats (0.2 arrives as 0.20000000298), and a value may
// have been set from somewhere else to a place between two steps. Plus and minus always land on a
// step: the next whole number of steps in that direction, never outside the robot's limits.

import type { SettingsLimits } from '../transport/messages';

export const SPEED_STEP = 0.05; // m/s
export const ANGLE_STEP = 5; // degrees
const HALF_TURN = 180; // rows at 180 degrees are the rows at 0
const NEAR = 1e-3; // of a step: a value this close to a step counts as on it

export type Direction = 1 | -1; // plus or minus

export interface Range {
  min: number;
  max: number;
  step: number;
}

/** Takes the float noise off a number worked out here (6 * 0.05 is 0.30000000000000004). */
function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** A range the robot has really sent: one from a gateway without limits is all zeros. */
function usable(range: Range): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) && Number.isFinite(range.step) && range.step > 0 && range.max > 0 && range.max >= range.min;
}

/** The next whole number of steps above `value` (direction 1) or below it (-1). */
function nextStep(value: number, direction: Direction, step: number): number {
  const steps = value / step;
  const n = direction > 0 ? Math.floor(steps + NEAR) + 1 : Math.ceil(steps - NEAR) - 1;
  return tidy(n * step);
}

/** Is there anywhere to go that way? Not from a limit, and not without limits. */
export function canStep(value: number, direction: Direction, range: Range): boolean {
  if (!usable(range) || !Number.isFinite(value)) return false;
  const slack = range.step * NEAR;
  return direction > 0 ? value < range.max - slack : value > range.min + slack;
}

/** `value` after plus or minus: the next step that way, held within the limits. A value between
 *  two steps goes to the nearer one in that direction; at a limit it stays where it is. */
export function stepValue(value: number, direction: Direction, range: Range): number {
  if (!canStep(value, direction, range)) return value;
  return Math.min(Math.max(nextStep(value, direction, range.step), range.min), range.max);
}

/** The ranges of the three stepped settings, from the limits the robot sent. */
export function rangesFrom(limits: SettingsLimits): { cleaningSpeed: Range; manualSpeed: Range; rowSpacing: Range } {
  return {
    cleaningSpeed: { min: limits.cleaningSpeedMin, max: limits.cleaningSpeedMax, step: SPEED_STEP },
    manualSpeed: { min: limits.manualSpeedMin, max: limits.manualSpeedMax, step: SPEED_STEP },
    rowSpacing: { min: limits.rowSpacingMin, max: limits.rowSpacingMax, step: tidy(limits.rowSpacingStep) },
  };
}

/** Any angle as the same rows' angle from 0 up to (not including) 180 degrees. */
export function wrapAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return ((angle % HALF_TURN) + HALF_TURN) % HALF_TURN;
}

/** The row angle after plus or minus: the next 5 degrees that way, going round: plus at 175 gives
 *  0, minus at 0 gives 175. */
export function stepAngle(angle: number, direction: Direction): number {
  return wrapAngle(nextStep(wrapAngle(angle), direction, ANGLE_STEP));
}

/** `value` with at least `least` decimals, and up to `most` when it needs them to be shown as it is. */
function digits(value: number, least: number, most: number): string {
  for (let d = least; d < most; d++) {
    const text = value.toFixed(d);
    if (Math.abs(value - Number(text)) < 0.5 * Math.pow(10, -most)) return text;
  }
  return value.toFixed(most);
}

/** "0.20 m/s"; a speed between two hundredths keeps its third decimal: "0.125 m/s". */
export function speedText(metresPerSecond: number): string {
  return Number.isFinite(metresPerSecond) ? `${digits(metresPerSecond, 2, 3)} m/s` : '-';
}

/** "25 cm"; a spacing that is not a whole number of centimetres keeps one decimal: "18.8 cm". */
export function spacingText(metres: number): string {
  return Number.isFinite(metres) ? `${digits(metres * 100, 0, 1)} cm` : '-';
}

/** "45°"; an angle between two whole degrees keeps one decimal: "37.5°". */
export function angleText(degrees: number): string {
  if (!Number.isFinite(degrees)) return '-';
  const text = digits(wrapAngle(degrees), 0, 1);
  return `${text === '180' ? '0' : text}°`; // 179.99 would round to 180, which is 0
}

/**
 * How far to turn a drawing of level lines to show rows at `angle` degrees from the map's x axis:
 * in degrees clockwise, the way a `rotate` on the screen counts. The map is drawn with x to the
 * right and y up (mapPicture.ts), so rows turn counter-clockwise as the angle grows: 0 lies level,
 * 45 climbs to the right, 90 stands upright.
 */
export function rowsTurnOnScreen(angle: number): number {
  return 0 - wrapAngle(angle);
}
