// The History tab's data: the past cleans and the totals, and the one clean opened to look at.
// No imports but types, so the client can clear it on disconnect without an import cycle.

import { create } from 'zustand';

import type { CleaningHistory, CleaningRecord } from '../transport/messages';

export interface HistoryState {
  list: { state: 'none' | 'loading' | 'ready' | 'failed'; history: CleaningHistory | null; problem: string | null };
  // The record opened: its numbers come with the list; its picture is fetched when it is opened.
  open: { id: string; state: 'loading' | 'ready' | 'failed'; record: CleaningRecord | null; problem: string | null } | null;
}

const initialHistory: HistoryState = { list: { state: 'none', history: null, problem: null }, open: null };

export const useHistory = create<HistoryState>(() => initialHistory);

export function resetHistory(): void {
  useHistory.setState(initialHistory);
}
