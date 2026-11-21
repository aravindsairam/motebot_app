// The History tab: the past cleans, newest first, with the totals; and one clean opened with its
// picture. The robot keeps them; the app asks when the tab is shown, when pulled down, and when a
// clean has just ended.

import { getCleaningRecord, listCleaningHistory } from './commands';
import { useHistory } from './historyStore';

export async function loadHistory(): Promise<void> {
  useHistory.setState((s) => ({ list: { ...s.list, state: 'loading', problem: null } }));
  const answer = await listCleaningHistory(0);
  useHistory.setState((s) => ({
    list:
      answer.ok && answer.history
        ? { state: 'ready', history: answer.history, problem: null }
        : { state: 'failed', history: s.list.history, problem: answer.ok ? 'the robot sent no history' : answer.text },
  }));
}

/** Open one clean: its numbers at once (from the list), its picture when the robot sends it. */
export async function openRecord(id: string): Promise<void> {
  const listed = useHistory.getState().list.history?.records.find((r) => r.id === id) ?? null;
  useHistory.setState({ open: { id, state: 'loading', record: listed, problem: null } });
  const answer = await getCleaningRecord(id);
  if (useHistory.getState().open?.id !== id) return; // closed, or another one opened, meanwhile
  useHistory.setState({
    open: answer.ok && answer.record
      ? { id, state: 'ready', record: answer.record, problem: null }
      : { id, state: 'failed', record: listed, problem: answer.ok ? 'the robot sent no record' : answer.text },
  });
}

export function closeRecord(): void {
  useHistory.setState({ open: null });
}
