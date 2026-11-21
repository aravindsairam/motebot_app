// The buttons' requests: each asks the robot for a mode, records that it is waiting, and shows
// the robot's answer when it is a no.

import { type Action, showNotice, showRefusal, useActions } from './actionsStore';
import { changeMode } from './commands';

/** `failTitle` heads the message card when the robot says no: "Couldn't dock". */
export async function runAction(action: Action, mode: string, failTitle: string): Promise<boolean> {
  useActions.setState({ busy: action });
  showNotice(null);
  const outcome = await changeMode(mode);
  useActions.setState((s) => ({ busy: s.busy === action ? null : s.busy }));
  if (!outcome.ok) showRefusal(failTitle, outcome.text);
  return outcome.ok;
}
