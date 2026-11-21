import type { CleaningPlan, PlanPiece, RobotState } from '../transport/messages';
import { NO_PREVIEW } from './cleaningStore';
import { cleaningControlsFor, previewFading, remainingPieces, visibleCleaned, visiblePieces } from './cleaningView';
import { cleaningStatus } from './testCleaning';

function robot(state: string, extra: Partial<RobotState> = {}): RobotState {
  return {
    state,
    previousState: '',
    reason: '',
    transitioning: false,
    allowedTransitions: ['idle', 'mapping', 'navigation', 'manual', 'docking', 'failsafe'].filter((m) => m !== state),
    faults: [],
    currentMap: 'house',
    enteredTime: 0,
    makingMap: state === 'mapping' || state === 'exploring',
    ...extra,
  };
}

const piece = (kind: PlanPiece['kind'], number = 0): PlanPiece => ({ kind, x0: 0, y0: 0, x1: 1, y1: 0, number, passNumber: 1 });
// transit, row 1, connector, row 2, connector, row 3, edge 1
const PIECES = [piece('transit'), piece('row', 1), piece('connector'), piece('row', 2), piece('connector'), piece('row', 3), piece('edge', 1)];
const plan = (jobId: number, pieces = PIECES): CleaningPlan => ({
  jobId,
  target: 'everything',
  pieces,
  estimate: { rows: 3, edges: 1, turns: 4, transits: 1, distance: 5, plannedArea: 2, leftOutArea: 0, unreachableArea: 0, time: 60 },
});

describe('the Clean button', () => {
  it.each(['idle', 'docked', 'manual', 'navigation', 'docking'])('opens the choosing panel from %s', (mode) => {
    expect(cleaningControlsFor(robot(mode), true, true, null, false).clean).toEqual({ enabled: true, hint: null });
  });

  it('says why not: no map', () => {
    expect(cleaningControlsFor(robot('idle', { currentMap: '' }), true, true, null, false).clean).toEqual({ enabled: false, hint: 'Make a map first' });
  });

  it('says why not: failsafe, mapping', () => {
    expect(cleaningControlsFor(robot('failsafe'), true, true, null, false).clean).toEqual({ enabled: false, hint: 'Reset first' });
    expect(cleaningControlsFor(robot('mapping'), true, true, null, false).clean).toEqual({ enabled: false, hint: 'Not while mapping' });
  });

  it('waits during a mode change, an old robot state, or without a connection', () => {
    expect(cleaningControlsFor(robot('idle', { transitioning: true }), true, true, null, false).clean.enabled).toBe(false);
    expect(cleaningControlsFor(robot('idle'), false, true, null, false).clean.enabled).toBe(false);
    expect(cleaningControlsFor(robot('idle'), true, false, null, false).clean.enabled).toBe(false);
  });

  it('is not offered while a clean runs', () => {
    const c = cleaningControlsFor(robot('cleaning'), true, true, cleaningStatus(), true);
    expect(c.running).toBe(true);
    expect(c.clean.enabled).toBe(false);
  });
});

describe('a clean under way', () => {
  it('is under way from the robot accepting it to the hand-over, in cleaning mode or not yet', () => {
    const idleChanging = robot('idle', { transitioning: true });
    expect(cleaningControlsFor(idleChanging, true, true, cleaningStatus({ state: 'starting' }), true).running).toBe(true);
    expect(cleaningControlsFor(robot('cleaning'), true, true, cleaningStatus({ state: 'ending' }), true).running).toBe(true);
    expect(cleaningControlsFor(robot('cleaning'), true, true, null, false).running).toBe(true);
  });

  it('is over once the robot has left cleaning mode and the status says how it ended', () => {
    expect(cleaningControlsFor(robot('docking'), true, true, cleaningStatus({ state: 'finished' }), true).running).toBe(false);
  });

  it('is not believed from an old status', () => {
    expect(cleaningControlsFor(robot('idle'), true, true, cleaningStatus(), false).running).toBe(false);
  });

  it('can be paused while cleaning, and resumed while paused', () => {
    expect(cleaningControlsFor(robot('cleaning'), true, true, cleaningStatus(), true).pause).toEqual({ enabled: true, label: 'Pause', resume: false });
    expect(cleaningControlsFor(robot('cleaning'), true, true, cleaningStatus({ state: 'paused' }), true).pause).toEqual({
      enabled: true,
      label: 'Resume',
      resume: true,
    });
    expect(cleaningControlsFor(robot('idle'), true, true, cleaningStatus({ state: 'starting' }), true).pause.enabled).toBe(false);
    expect(cleaningControlsFor(robot('cleaning'), true, false, cleaningStatus(), true).pause.enabled).toBe(false);
  });
});

describe('the rows on the map', () => {
  it('while cleaning: the piece being driven and those after it', () => {
    expect(remainingPieces(plan(7), cleaningStatus({ piece: 3 }))).toEqual(PIECES.slice(3));
    expect(remainingPieces(plan(7), cleaningStatus({ piece: 7 }))).toEqual([]);
    expect(remainingPieces(plan(7), cleaningStatus({ state: 'starting', piece: 0 }))).toEqual(PIECES);
  });

  it('only the running job rows: a late phone may hold the last job', () => {
    const status = cleaningStatus({ jobId: 7, piece: 1 });
    expect(visiblePieces(false, NO_PREVIEW, { value: plan(7), at: 0 }, status, true)).toEqual(PIECES.slice(1));
    expect(visiblePieces(false, NO_PREVIEW, { value: plan(6), at: 0 }, status, true)).toEqual([]);
    expect(visiblePieces(false, NO_PREVIEW, { value: plan(7), at: 0 }, status, false)).toEqual([]);
    expect(visiblePieces(false, NO_PREVIEW, { value: plan(7), at: 0 }, cleaningStatus({ state: 'finished' }), true)).toEqual([]);
  });

  it('while choosing: the preview, once the robot has answered the latest request', () => {
    const ready = { ...NO_PREVIEW, state: 'ready' as const, sentAt: 1000 };
    expect(visiblePieces(true, ready, { value: plan(0), at: 1200 }, null, false)).toEqual(PIECES);
    expect(visiblePieces(true, ready, { value: plan(0), at: 900 }, null, false)).toEqual([]); // an older preview's rows
    expect(visiblePieces(true, { ...ready, state: 'waiting' }, { value: plan(0), at: 1200 }, null, false)).toEqual([]);
    expect(visiblePieces(true, ready, { value: plan(7), at: 1200 }, null, false)).toEqual([]); // a job's rows, not a preview
  });

  it('while a new preview is on its way, the last one stays, faded', () => {
    const waiting = { ...NO_PREVIEW, state: 'waiting' as const, sentAt: 2000, lastReadyAt: 1000 };
    expect(visiblePieces(true, waiting, { value: plan(0), at: 1200 }, null, false)).toEqual(PIECES);
    expect(previewFading(true, waiting, { value: plan(0), at: 1200 })).toBe(true);
    // the first preview since the panel opened: nothing older of this choice to show
    expect(visiblePieces(true, { ...waiting, lastReadyAt: 0 }, { value: plan(0), at: 1200 }, null, false)).toEqual([]);
    // rows from before the last answered request (an earlier panel)
    expect(visiblePieces(true, waiting, { value: plan(0), at: 900 }, null, false)).toEqual([]);
    // answered: no longer faded
    expect(previewFading(true, { ...waiting, state: 'ready' }, { value: plan(0), at: 2100 })).toBe(false);
    expect(previewFading(false, waiting, { value: plan(0), at: 1200 })).toBe(false);
  });
});

describe('the cleaned floor on the map', () => {
  const cleaned = (jobId: number) => ({ value: { jobId, width: 1, height: 1, resolution: 0.05, originX: 0, originY: 0, cells: Int8Array.from([100]) }, at: 0 });

  it('is the running job, only', () => {
    expect(visibleCleaned(cleaned(7), cleaningStatus({ jobId: 7 }), true)?.jobId).toBe(7);
    expect(visibleCleaned(cleaned(6), cleaningStatus({ jobId: 7 }), true)).toBeNull();
    expect(visibleCleaned(cleaned(7), cleaningStatus({ jobId: 7 }), false)).toBeNull();
    expect(visibleCleaned(cleaned(7), null, true)).toBeNull();
  });
});
