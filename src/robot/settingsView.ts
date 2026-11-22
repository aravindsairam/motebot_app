// What the Settings card shows: each value as text, and which of its buttons are usable. Plain
// data in, plain data out, so it is tested without a screen.
//
// The controls are usable only while connected and once the robot has sent its settings. Without
// a connection the last values stay on the screen, greyed, like everything else that is not
// current. Minus is off at the lower limit and plus at the upper one; the row angle has no limits,
// it goes round.

import type { SettingsLimits, SettingsValues } from '../transport/messages';
import { angleText, canStep, type Range, rangesFrom, rowsTurnOnScreen, spacingText, speedText } from './settingsSteps';

export interface StepperView {
  text: string; // the value as shown: "0.20 m/s"
  less: boolean; // minus is usable
  more: boolean; // plus is usable
}

export interface SettingsView {
  enabled: boolean; // connected, and the robot has sent its settings: otherwise everything is greyed
  known: boolean; // the robot has sent its settings (now or before the connection was lost)
  cleaningSpeed: StepperView;
  manualSpeed: StepperView;
  rowSpacing: StepperView;
  rowAngleAuto: boolean; // the Auto switch
  rowAngle: StepperView | null; // null while Auto is on: there is no angle to set
  rowsTurn: number; // degrees to turn the drawing of the rows, clockwise on the screen
}

const UNKNOWN: StepperView = { text: '-', less: false, more: false };

/** `shown`: the values on the controls (settingsSync.ts). `limits`: from the robot's last report. */
export function settingsView(shown: SettingsValues | null, limits: SettingsLimits | null, connected: boolean): SettingsView {
  if (shown === null) {
    return { enabled: false, known: false, cleaningSpeed: UNKNOWN, manualSpeed: UNKNOWN, rowSpacing: UNKNOWN, rowAngleAuto: false, rowAngle: null, rowsTurn: 0 };
  }
  const ranges = limits ? rangesFrom(limits) : null;
  const stepper = (text: string, value: number, range: Range | null): StepperView => ({
    text,
    less: connected && range !== null && canStep(value, -1, range),
    more: connected && range !== null && canStep(value, 1, range),
  });
  return {
    enabled: connected,
    known: true,
    cleaningSpeed: stepper(speedText(shown.cleaningSpeed), shown.cleaningSpeed, ranges?.cleaningSpeed ?? null),
    manualSpeed: stepper(speedText(shown.manualSpeed), shown.manualSpeed, ranges?.manualSpeed ?? null),
    rowSpacing: stepper(spacingText(shown.rowSpacing), shown.rowSpacing, ranges?.rowSpacing ?? null),
    rowAngleAuto: shown.rowAngleAuto,
    rowAngle: shown.rowAngleAuto ? null : { text: angleText(shown.rowAngle), less: connected, more: connected },
    rowsTurn: rowsTurnOnScreen(shown.rowAngle),
  };
}
