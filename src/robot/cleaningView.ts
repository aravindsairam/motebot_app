// What the screens show about cleaning, and which cleaning buttons are usable. Plain data in,
// plain data out, so it is tested without a screen.
//
// The robot decides; the app only asks. Clean opens the choosing panel and never moves the robot
// by itself. A clean is started with one request: the robot switches to cleaning mode on its own.
//
// The robot sends the latest copy of each cleaning stream to a phone that connects late, and the
// rows and cleaned floor may still be the last job's: they are shown only when their job number
// matches the status's.

import type { CleanedArea, CleaningPlan, CleaningStatus, PlanPiece, RobotState } from '../transport/messages';
import { ENDED_STATES, RUNNING_STATES } from './cleaningText';
import type { PreviewState } from './cleaningStore';
import type { Received } from './store';

export interface CleaningControls {
  running: boolean; // a clean is under way: the Home tab shows its numbers, Pause, Dock and Stop
  clean: { enabled: boolean; hint: string | null }; // opens the choosing panel
  pause: { enabled: boolean; label: 'Pause' | 'Resume'; resume: boolean };
}

/**
 * `state`, `live`, `connected`: as for the other buttons (controls.ts). `status`: the latest
 * cleaning status, `statusLive`: it is recent (the robot sends it at least twice a second).
 */
export function cleaningControlsFor(
  state: RobotState | null,
  live: boolean,
  connected: boolean,
  status: CleaningStatus | null,
  statusLive: boolean,
): CleaningControls {
  const known = live && state !== null;
  const mode = known ? state.state : '';
  const changing = known && state.transitioning;
  const cleaningState = statusLive && status ? status.state : 'none';
  const running = (known && mode === 'cleaning') || RUNNING_STATES.includes(cleaningState);

  let clean: CleaningControls['clean'];
  if (!known || changing || running) clean = { enabled: false, hint: null };
  else if (mode === 'failsafe') clean = { enabled: false, hint: 'Reset first' };
  else if (state.makingMap || mode === 'mapping' || mode === 'exploring') clean = { enabled: false, hint: 'Not while mapping' };
  else if (!state.currentMap) clean = { enabled: false, hint: 'Make a map first' };
  else clean = { enabled: connected, hint: null };

  const pause: CleaningControls['pause'] =
    cleaningState === 'paused'
      ? { enabled: connected, label: 'Resume', resume: true }
      : { enabled: connected && cleaningState === 'cleaning', label: 'Pause', resume: false };

  return { running, clean, pause };
}

/** The pieces still to drive, in driving order: the one being driven (the status's `piece`) and
 *  those after it. While the robot is still getting ready, all of them. */
export function remainingPieces(plan: CleaningPlan, status: CleaningStatus): PlanPiece[] {
  if (status.state === 'starting') return plan.pieces;
  return plan.pieces.slice(Math.max(0, status.piece));
}

/**
 * While a new preview is on its way, the rows of the last one (since the panel opened) stay on the
 * map, faded, instead of the map going blank until the answer comes.
 */
export function previewFading(choosing: boolean, preview: PreviewState, plan: Received<CleaningPlan> | null): boolean {
  return (
    choosing &&
    plan !== null &&
    preview.state === 'waiting' &&
    preview.lastReadyAt > 0 &&
    plan.value.jobId === 0 &&
    plan.at >= preview.lastReadyAt
  );
}

/**
 * The rows to draw on the map. While choosing: the preview, once the robot has answered it (rows
 * that arrived before the latest request belong to an older choice), or the last one, faded, while
 * a new one is on its way. While a clean runs: the rows of that job still to drive. Otherwise none.
 */
export function visiblePieces(
  choosing: boolean,
  preview: PreviewState,
  plan: Received<CleaningPlan> | null,
  status: CleaningStatus | null,
  running: boolean,
): PlanPiece[] {
  if (plan === null) return [];
  if (choosing) {
    const answered = preview.state === 'ready' && plan.value.jobId === 0 && plan.at >= preview.sentAt;
    return answered || previewFading(choosing, preview, plan) ? plan.value.pieces : [];
  }
  if (running && status !== null && status.jobId !== 0 && plan.value.jobId === status.jobId && !ENDED_STATES.includes(status.state)) {
    return remainingPieces(plan.value, status);
  }
  return [];
}

/** The cleaned floor to tint: the running job's, only. */
export function visibleCleaned(cleaned: Received<CleanedArea> | null, status: CleaningStatus | null, running: boolean): CleanedArea | null {
  if (!running || cleaned === null || status === null || status.jobId === 0) return null;
  return cleaned.value.jobId === status.jobId ? cleaned.value : null;
}
