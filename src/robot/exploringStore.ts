// Exploring, as the app knows it: what the robot's exploration node reports (the status, the
// places still to look at), and which exploration this phone started or saw running, for the card
// at the end. No imports but types, so the client can clear it on disconnect without a cycle.

import { create } from 'zustand';

import type { ExplorationStatus, Frontiers } from '../transport/messages';
import type { Received } from './store';

export interface ExploringData {
  status: Received<ExplorationStatus> | null; // a copy at least twice a second while the exploration node runs
  frontiers: Received<Frontiers> | null; // the places still to look at; empty when none runs
  mine: number; // the exploration this phone started last: its end gets a card, however it ends
  seenRunning: number; // the exploration last seen running: its end gets a card too
  reported: number; // the exploration whose card has been shown
}

const initialExploring: ExploringData = { status: null, frontiers: null, mine: 0, seenRunning: 0, reported: 0 };

export const useExploring = create<ExploringData>(() => initialExploring);

export function resetExploring(): void {
  useExploring.setState(initialExploring);
}
