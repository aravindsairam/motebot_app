// The robot's settings, changed from the phone: how fast it cleans, how fast the joystick drives
// it, how far apart the cleaning rows are and which way they run. The robot keeps them and tells
// every phone when they change; the app shows what the robot reports and asks it to change them.
//
// A change shows at once and the complete set is sent. Only one request is on its way at a time:
// changes made meanwhile are sent together when its answer comes (settingsSync.ts). When the robot
// refuses, or the request fails, the controls go back to what the robot last reported and the
// message card says why.

import type { SettingsValues } from '../transport/messages';
import { showNotice, showRefusal, useActions } from './actionsStore';
import { setRobotSettings } from './commands';
import { type Direction, rangesFrom, stepAngle, stepValue } from './settingsSteps';
import { useSettings } from './settingsStore';
import { robotAnswered, shownSettings, userChanged } from './settingsSync';
import { useRobot } from './store';

export const SETTINGS_REFUSED = "Couldn't change the settings";

async function send(values: SettingsValues): Promise<void> {
  const outcome = await setRobotSettings(values);
  // Disconnected meanwhile: the settings were cleared, and nothing waits for this answer.
  if (useSettings.getState().inFlight !== values) return;
  const { state, send: next } = robotAnswered(useSettings.getState(), outcome.ok);
  useSettings.setState(state);
  if (!outcome.ok) showRefusal(SETTINGS_REFUSED, outcome.text || 'the robot gave no reason');
  else if (next !== null) void send(next);
}

/** The user has changed one or more of the settings: shown at once, and the robot is asked.
 *  Does nothing until the robot has sent its settings. */
export function changeSettings(change: Partial<SettingsValues>): void {
  const sync = useSettings.getState();
  const shown = shownSettings(sync);
  if (shown === null) return;
  // A new try: the card about the last one that failed is no longer news.
  if (useActions.getState().notice?.title === SETTINGS_REFUSED) showNotice(null);
  const { state, send: now } = userChanged(sync, { ...shown, ...change });
  useSettings.setState(state);
  if (now !== null) void send(now);
}

export type SteppedSetting = 'cleaningSpeed' | 'manualSpeed' | 'rowSpacing';

/** Plus or minus on a speed or on the row spacing: the next step that way, within the robot's
 *  limits. Reads the value on the controls now, so quick taps each move on from the last. */
export function stepSetting(which: SteppedSetting, direction: Direction): void {
  const shown = shownSettings(useSettings.getState());
  const limits = useRobot.getState().settings?.value.limits;
  if (shown === null || !limits) return;
  const next = stepValue(shown[which], direction, rangesFrom(limits)[which]);
  if (next === shown[which]) return; // at a limit
  const change: Partial<SettingsValues> = {};
  change[which] = next;
  changeSettings(change);
}

/** Plus or minus on the row angle: 5 degrees that way, going round at 0 and 175. */
export function stepRowAngle(direction: Direction): void {
  const shown = shownSettings(useSettings.getState());
  if (shown !== null) changeSettings({ rowAngle: stepAngle(shown.rowAngle, direction) });
}

/** The Auto switch of the row direction. The angle is kept for when Auto goes off again. */
export function setRowAngleAuto(auto: boolean): void {
  changeSettings({ rowAngleAuto: auto });
}
