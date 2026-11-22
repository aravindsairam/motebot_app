// Changing the settings without waiting: a tap shows at once, and the robot is asked in the
// background. One request at a time: taps made while one is on its way are folded together, and
// the newest set goes out when the answer comes. When the robot says no, or the request fails,
// the controls go back to what the robot last reported.
//
// Plain data in, plain data out. Each step returns the new state and, when a request should go
// out now, the set to send. Who sends it and where the state is kept is the caller's business
// (settings.ts, settingsStore.ts), so this is tested without a connection.

import type { SettingsValues } from '../transport/messages';

export interface SettingsSync {
  // What the robot holds, as far as the app knows: its last report, or the set it last said OK
  // to when its report of that has not arrived yet. Null until the robot has sent its settings.
  robot: SettingsValues | null;
  wanted: SettingsValues | null; // what the user has set and the robot has not answered for yet; shown instead of `robot`
  inFlight: SettingsValues | null; // the request waiting for its answer
  reportedSince: boolean; // the robot has reported its settings since that request went out
}

export const NO_SYNC: SettingsSync = { robot: null, wanted: null, inFlight: null, reportedSince: false };

export interface Step {
  state: SettingsSync;
  send: SettingsValues | null; // ask the robot for this set now
}

/** Only the five values: a report also carries the limits, which are not the phone's to send. */
export function valuesOf(s: SettingsValues): SettingsValues {
  return { cleaningSpeed: s.cleaningSpeed, manualSpeed: s.manualSpeed, rowSpacing: s.rowSpacing, rowAngleAuto: s.rowAngleAuto, rowAngle: s.rowAngle };
}

/** Would the two sets be the same message? The numbers travel as 32-bit floats. */
export function sameSettings(a: SettingsValues, b: SettingsValues): boolean {
  const f = Math.fround;
  return (
    f(a.cleaningSpeed) === f(b.cleaningSpeed) &&
    f(a.manualSpeed) === f(b.manualSpeed) &&
    f(a.rowSpacing) === f(b.rowSpacing) &&
    a.rowAngleAuto === b.rowAngleAuto &&
    f(a.rowAngle) === f(b.rowAngle)
  );
}

/** What the controls show: the user's own change while the robot has not answered, else the robot's. */
export function shownSettings(s: SettingsSync): SettingsValues | null {
  return s.wanted ?? s.robot;
}

/** The user has set `values` (the complete set). Sent at once, unless a request is already on its
 *  way: then it waits for that answer. Nothing happens before the robot has sent its settings. */
export function userChanged(s: SettingsSync, values: SettingsValues): Step {
  if (s.robot === null) return { state: s, send: null };
  const wanted = valuesOf(values);
  if (s.inFlight !== null) return { state: { ...s, wanted }, send: null };
  if (sameSettings(wanted, s.robot)) return { state: { ...s, wanted: null }, send: null }; // back where the robot is
  return { state: { ...s, wanted, inFlight: wanted, reportedSince: false }, send: wanted };
}

/** The robot has sent its settings. They are the truth; while a request waits for its answer the
 *  controls go on showing what the user set. */
export function robotReported(s: SettingsSync, values: SettingsValues): SettingsSync {
  return { ...s, robot: valuesOf(values), reportedSince: s.inFlight !== null };
}

/**
 * The request on its way has been answered, or has failed (`ok` false: refused, not available,
 * timed out, connection lost).
 *
 * Not OK: back to what the robot last reported; changes made meanwhile are dropped with it.
 * OK: if the user has changed something since, the newest set goes out now. The robot's report
 * of the new settings may come before or after this answer: until it has come, the set the robot
 * said OK to stands in for it, so the controls do not jump back for a moment.
 */
export function robotAnswered(s: SettingsSync, ok: boolean): Step {
  const sent = s.inFlight;
  if (sent === null) return { state: s, send: null };
  if (!ok) return { state: { robot: s.robot, wanted: null, inFlight: null, reportedSince: false }, send: null };
  const robot = s.reportedSince ? s.robot : sent;
  if (s.wanted !== null && !sameSettings(s.wanted, sent)) {
    return { state: { robot, wanted: s.wanted, inFlight: s.wanted, reportedSince: false }, send: s.wanted };
  }
  return { state: { robot, wanted: null, inFlight: null, reportedSince: false }, send: null };
}
