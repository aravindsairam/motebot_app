// A cleaning status for tests, with every field: change what the test is about.

import type { CleaningJob, CleaningStatus } from '../transport/messages';

export const TEST_JOB: CleaningJob = {
  what: 'everything',
  area: [],
  spotX: 0,
  spotY: 0,
  planName: '',
  direction: '',
  passes: 1,
  edges: 'off',
  returnToDock: 'on',
};

export function cleaningStatus(more: Partial<CleaningStatus> = {}): CleaningStatus {
  return {
    state: 'cleaning',
    message: 'row 12 of 31',
    jobId: 7,
    target: 'everything',
    job: TEST_JOB,
    started: 0,
    coverage: 43.2,
    cleanedArea: 9.125,
    plannedArea: 21.25,
    distance: 38.25,
    cleaningTime: 370,
    timeLeft: 360,
    rowsDone: 11,
    rowsTotal: 31,
    rowsSkipped: 0,
    currentRow: 12,
    edgesDone: 0,
    edgesTotal: 0,
    edgesSkipped: 0,
    currentEdge: 0,
    bumps: 0,
    pauses: 0,
    piece: 23,
    ...more,
  };
}
