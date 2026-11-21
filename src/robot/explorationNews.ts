// What the app does with each exploration status besides keeping it: the card at the end, once
// per exploration, for one this phone started or saw running. A phone that connects after an
// exploration has ended does not get an old card.

import type { ExplorationStatus } from '../transport/messages';
import { showNotice } from './actionsStore';
import { useExploring } from './exploringStore';
import { ENDED_EXPLORATION, explorationReport, RUNNING_EXPLORATION } from './exploringText';

/** Called with every exploration status the robot sends. */
export function onExplorationStatus(status: ExplorationStatus): void {
  if (status.jobId === 0) return;
  if (RUNNING_EXPLORATION.includes(status.state)) {
    if (useExploring.getState().seenRunning !== status.jobId) useExploring.setState({ seenRunning: status.jobId });
    return;
  }
  const { mine, seenRunning, reported } = useExploring.getState();
  if (ENDED_EXPLORATION.includes(status.state) && (mine === status.jobId || seenRunning === status.jobId) && reported !== status.jobId) {
    useExploring.setState({ reported: status.jobId });
    const notice = explorationReport(status);
    if (notice) showNotice(notice);
  }
}
