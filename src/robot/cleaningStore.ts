// Cleaning, as the app knows it: what the robot reports (the status, the rows, the cleaned floor)
// and the clean the user is setting up on the phone. No imports but types, so the client can clear
// it on disconnect without an import cycle.

import { create } from 'zustand';

import type { CleanedArea, CleaningEstimate, CleaningPlan, CleaningPlanInfo, CleaningStatus } from '../transport/messages';
import type { Box } from './cleanArea';
import type { Received } from './store';

export interface CleaningData {
  status: Received<CleaningStatus> | null; // a copy at least twice a second while the cleaning node runs
  plan: Received<CleaningPlan> | null; // the rows of the job running (its number) or of the last preview (0)
  cleaned: Received<CleanedArea> | null; // the floor cleaned by the job of that number
  mine: number; // the job this phone started last: its end gets a report card, however it ends
  seenRunning: number; // the job last seen cleaning or paused: its end gets a report card too
  reported: number; // the job whose report card has been shown
}

const initialCleaning: CleaningData = { status: null, plan: null, cleaned: null, mine: 0, seenRunning: 0, reported: 0 };

export const useCleaning = create<CleaningData>(() => initialCleaning);

export type ChoiceKind = 'everything' | 'area' | 'spot' | 'room' | 'plan';

export interface CleanOptions {
  edges: boolean; // a pass along walls and furniture after the rows
  twice: boolean; // a second pass, crosswise
  returnToDock: boolean; // dock when finished
}

// The robot's own defaults: no edges, once, back to the dock. The app sends each one explicitly,
// so what the switches show is what the robot is asked for.
export const DEFAULT_OPTIONS: CleanOptions = { edges: false, twice: false, returnToDock: true };

/** The robot's preview of the clean being set up: the estimate here, the rows on the map. */
export interface PreviewState {
  state: 'none' | 'waiting' | 'ready' | 'refused';
  key: string; // the job it is for; a change of choice makes a new key
  estimate: CleaningEstimate | null;
  replanned: boolean; // a saved plan whose map has changed: its rows were planned again
  problem: string | null; // why the robot cannot clean that, in its words
  sentAt: number; // ms, when the request went out: rows that arrived before are an older preview's
  lastReadyAt: number; // ms, when the last answered request (since the panel opened) went out; 0 = none
}

export const NO_PREVIEW: PreviewState = { state: 'none', key: '', estimate: null, replanned: false, problem: null, sentAt: 0, lastReadyAt: 0 };

export interface PlansList {
  state: 'none' | 'loading' | 'ready' | 'failed';
  list: CleaningPlanInfo[];
  problem: string | null;
}

export interface ChoiceState {
  open: boolean; // the choosing panel is up on the Home tab
  kind: ChoiceKind;
  area: Box | null; // metres, map coordinates
  spot: { x: number; y: number } | null; // metres, map coordinates
  planName: string | null;
  roomName: string | null; // a room of the map in use, by name
  options: CleanOptions;
  preview: PreviewState;
  plans: PlansList;
}

const initialChoice: ChoiceState = {
  open: false,
  kind: 'everything',
  area: null,
  spot: null,
  planName: null,
  roomName: null,
  options: DEFAULT_OPTIONS,
  preview: NO_PREVIEW,
  plans: { state: 'none', list: [], problem: null },
};

export const useChoice = create<ChoiceState>(() => initialChoice);

export function resetCleaning(): void {
  useCleaning.setState(initialCleaning);
  useChoice.setState(initialChoice);
}
