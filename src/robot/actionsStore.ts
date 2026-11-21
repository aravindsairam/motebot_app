// Which button's request is waiting for the robot's answer, and the message card: the robot's
// words when it said no, or news about a trip. Shared by every screen, so a Stop pressed on one
// tab shows as "Stopping…" on the other.

import { create } from 'zustand';

export type Action =
  | 'stop'
  | 'dock'
  | 'reset'
  | 'goto'
  | 'drive'
  | 'new_map'
  | 'save_map'
  | 'discard_map'
  | 'mode'
  | 'clean'
  | 'pause'
  | 'resume'
  | 'save_plan'
  | 'delete_plan'
  | 'explore';

export interface Notice {
  tone: 'error' | 'success' | 'info';
  title: string; // what happened, in a few words: "Can't go there"
  text: string; // why, in the robot's words where it gave any; may be empty
  keep?: boolean; // good news that stays until dismissed: the report at the end of a clean
}

export interface ActionState {
  busy: Action | null;
  notice: Notice | null;
}

export const useActions = create<ActionState>(() => ({ busy: null, notice: null }));

/** Good news goes away by itself after this long; problems stay until dismissed. */
export const SUCCESS_SHOWN_MS = 4000;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showNotice(notice: Notice | null): void {
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = null;
  useActions.setState({ notice });
  if (notice && notice.tone === 'success' && !notice.keep) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (useActions.getState().notice === notice) useActions.setState({ notice: null });
    }, SUCCESS_SHOWN_MS);
  }
}

/** "no route to that spot" -> "No route to that spot." */
export function sentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const first = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(first) ? first : `${first}.`;
}

/** The answer to a request that the robot refused or that failed. */
export function showRefusal(title: string, robotText: string): void {
  showNotice({ tone: 'error', title, text: sentence(robotText) });
}

export function resetActions(): void {
  showNotice(null);
  useActions.setState({ busy: null });
}

export function dismissNotice(): void {
  showNotice(null);
}
