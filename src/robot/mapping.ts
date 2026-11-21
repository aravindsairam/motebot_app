// Making a new map from the phone: New map switches the robot to mapping; the user drives it
// around with the joystick while the map grows; Save map stores it under a name (asking before
// replacing a map of that name) and the robot goes back to idle, now using the new map. Discard
// goes back to idle without saving, and the robot keeps the map it had.

import { type Action, showNotice, showRefusal, useActions } from './actionsStore';
import { changeMode, sendSaveMap } from './commands';
import { releaseStick } from './drive';

/** The names the robot accepts (the mode manager's rule): letters, digits, '-' and '_'. */
export function mapNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Give the map a name';
  if (n.length > 40) return 'At most 40 characters';
  if (!/^[A-Za-z0-9_-]+$/.test(n)) return "Only letters, digits, '-' and '_'";
  if (n.endsWith('_keepout') || n.endsWith('_zones')) return `A name cannot end in '${n.endsWith('_zones') ? '_zones' : '_keepout'}'`;
  return null;
}

async function busyWith<T>(action: Action, work: () => Promise<T>): Promise<T> {
  useActions.setState({ busy: action });
  showNotice(null);
  try {
    return await work();
  } finally {
    useActions.setState((s) => ({ busy: s.busy === action ? null : s.busy }));
  }
}

export async function startMapping(): Promise<boolean> {
  return busyWith('new_map', async () => {
    const outcome = await changeMode('mapping');
    if (!outcome.ok) showRefusal("Couldn't start mapping", outcome.text);
    return outcome.ok;
  });
}

export type SaveResult = 'saved' | 'name_taken' | 'failed';

/** Save the map being made under `name`, then leave mapping. 'name_taken': a map of that name
 *  exists and `replace` was false: ask the user, then call again with `replace`. */
export async function saveMap(name: string, replace: boolean): Promise<SaveResult> {
  releaseStick();
  return busyWith('save_map', async () => {
    const saved = await sendSaveMap(name.trim(), replace);
    if (saved.nameTaken) return 'name_taken';
    if (!saved.ok) {
      showRefusal("Couldn't save the map", saved.text);
      return 'failed';
    }
    const idle = await changeMode('idle');
    if (!idle.ok) {
      showRefusal('Map saved, but the robot is still mapping', idle.text);
      return 'saved';
    }
    showNotice({ tone: 'success', title: `Map saved as '${name.trim()}'`, text: 'The robot uses it from now on.' });
    return 'saved';
  });
}

export async function discardMap(): Promise<void> {
  releaseStick();
  await busyWith('discard_map', async () => {
    const outcome = await changeMode('idle');
    if (!outcome.ok) showRefusal("Couldn't leave mapping", outcome.text);
  });
}
