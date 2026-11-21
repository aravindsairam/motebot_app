// What the app does with each cleaning status the robot sends, besides keeping it: the report
// card when a clean ends, once per job, and getting the choosing panel out of the way when a clean
// starts.
//
// A report is shown for a job this phone started, however it ends (a job can be accepted and
// then fail to start: the robot could not switch to cleaning mode), and for one this phone has
// seen cleaning, wherever it was started. A phone that connects after a clean has ended does not
// get an old report: the History tab has every clean.

import type { CleaningStatus } from '../transport/messages';
import { showNotice } from './actionsStore';
import { NO_PREVIEW, useChoice, useCleaning } from './cleaningStore';
import { cleaningReport, ENDED_STATES, RUNNING_STATES } from './cleaningText';

/** Called with every cleaning status the robot sends. */
export function onCleaningStatus(status: CleaningStatus): void {
  if (status.jobId === 0) return;
  if (RUNNING_STATES.includes(status.state)) {
    // A clean is under way, from this phone or anywhere else: the cleaning view takes over.
    if (useChoice.getState().open) useChoice.setState({ open: false, preview: NO_PREVIEW });
    if ((status.state === 'cleaning' || status.state === 'paused') && useCleaning.getState().seenRunning !== status.jobId) {
      useCleaning.setState({ seenRunning: status.jobId });
    }
    return;
  }
  const { mine, seenRunning, reported } = useCleaning.getState();
  if (ENDED_STATES.includes(status.state) && (mine === status.jobId || seenRunning === status.jobId) && reported !== status.jobId) {
    useCleaning.setState({ reported: status.jobId });
    const notice = cleaningReport(status);
    if (notice) showNotice(notice);
  }
}
