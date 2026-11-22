import { vacuum } from '../proto/vacuum';
import { CommandType } from '../transport/messages';
import {
  CleaningState,
  cleanedAreaFrame,
  cleaningPlanFrame,
  cleaningStatusFrame,
  helloFrame,
  PieceKind,
  replyFrame,
  ReplyResult,
  replyWith,
  robotStateFrame,
  sentCommands,
  TestSocket,
} from '../transport/testSocket';
import { useActions } from './actionsStore';
import {
  chooseKind,
  choosePlan,
  chooseRoom,
  closeChooser,
  deletePlan,
  forgetCleanStart,
  openChooser,
  pauseClean,
  placeArea,
  placeSpot,
  savePlan,
  setArea,
  setOption,
  startClean,
} from './cleaning';
import { DEFAULT_OPTIONS, useChoice, useCleaning } from './cleaningStore';
import { visiblePieces } from './cleaningView';
import { connectTo, disconnect } from './client';

const pb = vacuum.v1;
const What = pb.CleaningJob.What;
const Option = pb.CleaningJob.Option;
const ESTIMATE = { rows: 31, edges: 0, turns: 64, transits: 3, distance: 88.5, plannedArea: 21.25, leftOutArea: 0.5, unreachableArea: 1.75, time: 840 };

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
  useChoice.setState({ kind: 'everything', area: null, spot: null, planName: null, roomName: null, options: DEFAULT_OPTIONS });
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

function connected(state = 'idle') {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame(state, { currentMap: 'house', allowedTransitions: ['navigation', 'manual', 'docking'] }));
  return socket;
}

/** The last command sent, once the code has had the chance to send it. */
async function lastSent(socket: TestSocket) {
  await flush();
  const sent = sentCommands(socket);
  return sent[sent.length - 1];
}

async function answer(socket: TestSocket, frame: (requestId: number) => Uint8Array) {
  const sent = await lastSent(socket);
  socket.deliver(frame(sent.requestId));
  await flush();
  return sent;
}

const status = (more: vacuum.v1.CleaningStatus.$Properties) => cleaningStatusFrame({ jobId: 7, target: 'everything', ...more });

describe('the cleaning streams', () => {
  it('are kept in the store, and forgotten on disconnect', () => {
    const socket = connected();
    socket.deliver(status({ state: CleaningState.STATE_CLEANING, currentRow: 3, rowsTotal: 9, piece: 4 }));
    socket.deliver(cleaningPlanFrame({ jobId: 7, pieces: [{ kind: PieceKind.KIND_ROW, x0Cm: 0, y0Cm: 0, x1Cm: 150, y1Cm: 0, number: 1 }] }));
    socket.deliver(cleanedAreaFrame(7));
    const s = useCleaning.getState();
    expect(s.status?.value).toMatchObject({ state: 'cleaning', jobId: 7, currentRow: 3, piece: 4 });
    expect(s.plan?.value.pieces).toEqual([{ kind: 'row', x0: 0, y0: 0, x1: 1.5, y1: 0, number: 1, passNumber: 0 }]);
    expect([...(s.cleaned?.value.cells ?? [])]).toEqual([100, 0, 0, 0]);
    disconnect();
    expect(useCleaning.getState()).toMatchObject({ status: null, plan: null, cleaned: null });
  });
});

describe('the report at the end of a clean', () => {
  it('comes once for a clean seen cleaning, however many times the robot repeats how it ended', () => {
    const socket = connected('cleaning');
    socket.deliver(status({ state: CleaningState.STATE_CLEANING }));
    socket.deliver(status({ state: CleaningState.STATE_ENDING }));
    expect(useActions.getState().notice).toBeNull();
    socket.deliver(status({ state: CleaningState.STATE_FINISHED, cleanedArea: 21, coverage: 96, cleaningTime: 840 }));
    expect(useActions.getState().notice).toEqual({ tone: 'success', title: 'Cleaning finished', text: 'Cleaned 21 m² (96%) in 14 minutes.', keep: true });
    useActions.setState({ notice: null });
    socket.deliver(status({ state: CleaningState.STATE_FINISHED, cleanedArea: 21, coverage: 96, cleaningTime: 840 }));
    expect(useActions.getState().notice).toBeNull();
    jest.advanceTimersByTime(10_000); // the report stays until dismissed: no timer takes it away
  });

  it('is not shown to a phone that connects after the clean ended', () => {
    const socket = connected();
    socket.deliver(status({ state: CleaningState.STATE_STOPPED, message: 'stopped: the robot left cleaning mode (now idle)' }));
    expect(useActions.getState().notice).toBeNull();
  });

  it('comes for a clean this phone started that failed before it began cleaning', async () => {
    const socket = connected();
    const done = startClean();
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '31 rows, about 14 min', { jobId: 9, estimate: ESTIMATE }));
    await done;
    socket.deliver(status({ jobId: 9, state: CleaningState.STATE_STARTING }));
    socket.deliver(status({ jobId: 9, state: CleaningState.STATE_FAILED, message: 'failed: could not switch to cleaning mode: busy' }));
    expect(useActions.getState().notice).toEqual({
      tone: 'error',
      title: "Cleaning didn't finish",
      text: 'Could not switch to cleaning mode: busy.',
      keep: true,
    });
  });
});

describe('choosing what to clean', () => {
  it('asks for a preview of everything at once, and shows its rows once the robot has answered', async () => {
    const socket = connected();
    openChooser();
    jest.advanceTimersByTime(0);
    const sent = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '31 rows', { estimate: ESTIMATE }));
    expect(sent.type).toBe(CommandType.COMMAND_PREVIEW_CLEANING);
    expect(sent.job).toMatchObject({ what: What.WHAT_EVERYTHING, passes: 1, edges: Option.OPTION_OFF, returnToDock: Option.OPTION_ON });
    expect(useChoice.getState().preview).toMatchObject({ state: 'ready', estimate: ESTIMATE, problem: null });
    socket.deliver(cleaningPlanFrame({ jobId: 0, pieces: [{ kind: PieceKind.KIND_ROW, x1Cm: 100, number: 1 }] }));
    const { plan } = useCleaning.getState();
    expect(visiblePieces(true, useChoice.getState().preview, plan, null, false)).toHaveLength(1);
    expect(sentCommands(socket).some((c) => c.type === CommandType.COMMAND_CHANGE_MODE)).toBe(false); // nothing moves
  });

  it('asks nothing until an area is drawn, then at once, once for changes made together', async () => {
    const socket = connected();
    openChooser();
    jest.advanceTimersByTime(0);
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { estimate: ESTIMATE }));
    chooseKind('area');
    jest.advanceTimersByTime(1000);
    await flush();
    expect(sentCommands(socket)).toHaveLength(1);
    expect(useChoice.getState().preview.state).toBe('none');
    setArea({ x0: 1, y0: 0, x1: 2, y1: 1 });
    setArea({ x0: 1.2, y0: 0.2, x1: 3.2, y1: 1.4 });
    expect(sentCommands(socket)).toHaveLength(1);
    jest.advanceTimersByTime(0);
    const sent = await lastSent(socket);
    expect(sentCommands(socket)).toHaveLength(2);
    expect(sent.job).toMatchObject({ what: What.WHAT_AREA, area: [1.2, 0.2, 3.2, 0.2, 3.2, 1.4, 1.2, 1.4] });
  });

  it('a tap with no area yet places a 2 m square around it', () => {
    connected();
    openChooser();
    chooseKind('area');
    placeArea(1, 1);
    expect(useChoice.getState().area).toEqual({ x0: 0, y0: 0, x1: 2, y1: 2 });
    placeArea(5, 5); // one is there: the tap does nothing
    expect(useChoice.getState().area).toEqual({ x0: 0, y0: 0, x1: 2, y1: 2 });
  });

  it('drops the answer to an older choice', async () => {
    const socket = connected();
    openChooser();
    chooseKind('spot');
    placeSpot(1, 1);
    jest.advanceTimersByTime(0);
    const first = await lastSent(socket);
    placeSpot(2, 2);
    jest.advanceTimersByTime(0);
    const second = await lastSent(socket);
    expect(second.job).toMatchObject({ what: What.WHAT_SPOT, spotX: 2, spotY: 2 });
    socket.deliver(replyWith(first.requestId, ReplyResult.RESULT_OK, '', { estimate: { ...ESTIMATE, rows: 4 } }));
    await flush();
    expect(useChoice.getState().preview.state).toBe('waiting');
    socket.deliver(replyWith(second.requestId, ReplyResult.RESULT_OK, '', { estimate: { ...ESTIMATE, rows: 5 } }));
    await flush();
    expect(useChoice.getState().preview).toMatchObject({ state: 'ready', estimate: { rows: 5 } });
  });

  it("shows the robot's reason when it cannot clean the choice", async () => {
    const socket = connected();
    openChooser();
    chooseKind('spot');
    placeSpot(9, 9);
    jest.advanceTimersByTime(0);
    await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_REFUSED, 'no reachable floor in that area'));
    expect(useChoice.getState().preview).toMatchObject({ state: 'refused', problem: 'no reachable floor in that area' });
  });

  it('a change of option is a new preview', async () => {
    const socket = connected();
    openChooser();
    jest.advanceTimersByTime(0);
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { estimate: ESTIMATE }));
    setOption('twice', true);
    jest.advanceTimersByTime(0);
    expect((await lastSent(socket)).job).toMatchObject({ passes: 2 });
  });

  it('a room: nothing until one is picked, then a preview of that room, and Start cleans it', async () => {
    const socket = connected();
    openChooser();
    jest.advanceTimersByTime(0);
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { estimate: ESTIMATE }));
    chooseKind('room');
    jest.advanceTimersByTime(0);
    await flush();
    expect(sentCommands(socket)).toHaveLength(1);
    expect(useChoice.getState().preview.state).toBe('none');
    chooseRoom('Kitchen');
    jest.advanceTimersByTime(0);
    const preview = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { estimate: ESTIMATE }));
    expect(preview).toMatchObject({ type: CommandType.COMMAND_PREVIEW_CLEANING, job: { what: What.WHAT_ROOM, room: 'Kitchen', passes: 1 } });
    expect(useChoice.getState().preview.state).toBe('ready');
    const done = startClean();
    const start = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { jobId: 8, estimate: ESTIMATE }));
    await done;
    expect(start).toMatchObject({ type: CommandType.COMMAND_START_CLEANING, job: { what: What.WHAT_ROOM, room: 'Kitchen' } });
    expect(useCleaning.getState().mine).toBe(8);
  });

  it('a room no longer there is unchosen: no preview is asked for it', async () => {
    const socket = connected();
    openChooser();
    chooseKind('room');
    chooseRoom('Kitchen');
    chooseRoom(null);
    jest.advanceTimersByTime(0);
    await flush();
    expect(sentCommands(socket).filter((c) => c.job?.what === What.WHAT_ROOM)).toEqual([]);
    expect(useChoice.getState().preview.state).toBe('none');
  });

  it('closes when a clean starts anywhere, for the cleaning view', () => {
    const socket = connected();
    openChooser();
    socket.deliver(status({ jobId: 11, state: CleaningState.STATE_STARTING }));
    expect(useChoice.getState().open).toBe(false);
  });
});

describe('starting, pausing, stopping', () => {
  it('starts with one request, no mode change: the robot switches to cleaning mode by itself', async () => {
    const socket = connected('docked');
    openChooser();
    const done = startClean();
    expect(useChoice.getState().open).toBe(false); // the cleaning view takes over
    expect(useActions.getState().busy).toBe('clean');
    const sent = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '31 rows', { jobId: 7, estimate: ESTIMATE }));
    await done;
    expect(sent).toMatchObject({ type: CommandType.COMMAND_START_CLEANING, job: { what: What.WHAT_EVERYTHING } });
    expect(sentCommands(socket).filter((c) => c.type === CommandType.COMMAND_CHANGE_MODE)).toEqual([]);
    expect(useCleaning.getState().mine).toBe(7);
    expect(useActions.getState()).toMatchObject({ busy: null, notice: null });
  });

  it("brings the panel back with the robot's reason when it refuses", async () => {
    const socket = connected();
    openChooser();
    const done = startClean();
    await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_REFUSED, 'the robot is mapping: save or discard the map first'));
    await done;
    expect(useActions.getState().notice).toEqual({
      tone: 'error',
      title: "Couldn't start cleaning",
      text: 'The robot is mapping: save or discard the map first.',
    });
    expect(useChoice.getState().open).toBe(true);
  });

  it('says nothing about the start when Stop was pressed while it waited', async () => {
    const socket = connected();
    openChooser();
    const done = startClean();
    forgetCleanStart();
    await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_REFUSED, 'the job was stopped'));
    await done;
    expect(useActions.getState().notice).toBeNull();
    expect(useChoice.getState().open).toBe(false);
  });

  it('pauses and resumes', async () => {
    const socket = connected('cleaning');
    const paused = pauseClean(false);
    expect(useActions.getState().busy).toBe('pause');
    const sent = await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_OK, 'paused'));
    await paused;
    expect(sent).toMatchObject({ type: CommandType.COMMAND_PAUSE_CLEANING, resume: false });
    const resumed = pauseClean(true);
    await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_REFUSED, 'no cleaning job is paused'));
    await resumed;
    expect((await lastSent(socket)).resume).toBe(true);
    expect(useActions.getState().notice).toMatchObject({ title: "Couldn't resume", text: 'No cleaning job is paused.' });
  });
});

describe('saved plans', () => {
  const info = (name: string) => ({ name, job: { what: What.WHAT_AREA, area: [0, 0, 1, 0, 1, 1] }, estimate: ESTIMATE, saved: 1 });

  it('asks before replacing: a taken name is reported, not overwritten', async () => {
    const socket = connected();
    openChooser();
    chooseKind('spot');
    placeSpot(1, 2);
    const first = savePlan(' Hall ', false);
    const sent = await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_ALREADY_EXISTS, "a plan named 'Hall' already exists"));
    expect(await first).toBe('name_taken');
    expect(sent).toMatchObject({ type: CommandType.COMMAND_SAVE_CLEANING_PLAN, name: 'Hall', replace: false, job: { what: What.WHAT_SPOT } });
    expect(useActions.getState().notice).toBeNull();
    const second = savePlan('Hall', true);
    const again = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, "saved 'Hall'", { estimate: ESTIMATE }));
    expect(again.replace).toBe(true);
    expect(await second).toBe('saved');
    expect(useActions.getState().notice).toMatchObject({ tone: 'success', title: "Plan saved as 'Hall'" });
  });

  it('lists them, runs one by name, and deletes one', async () => {
    const socket = connected();
    openChooser();
    chooseKind('plan');
    const list = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { plans: [info('Hall'), info('Kitchen')] }));
    expect(list.type).toBe(CommandType.COMMAND_LIST_CLEANING_PLANS);
    expect(useChoice.getState().plans).toMatchObject({ state: 'ready', list: [{ name: 'Hall' }, { name: 'Kitchen' }] });
    choosePlan('Hall');
    jest.advanceTimersByTime(0);
    const preview = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { estimate: ESTIMATE, replanned: true }));
    expect(preview.job).toMatchObject({ what: What.WHAT_PLAN, planName: 'Hall' });
    expect(useChoice.getState().preview).toMatchObject({ state: 'ready', replanned: true });

    const deleting = deletePlan('Hall');
    const del = await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_OK, "deleted 'Hall'"));
    expect(del).toMatchObject({ type: CommandType.COMMAND_DELETE_CLEANING_PLAN, name: 'Hall' });
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { plans: [info('Kitchen')] }));
    await deleting;
    expect(useChoice.getState()).toMatchObject({ planName: null, plans: { list: [{ name: 'Kitchen' }] } });
  });

  it('closing the panel forgets the preview', async () => {
    const socket = connected();
    openChooser();
    jest.advanceTimersByTime(0);
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { estimate: ESTIMATE }));
    closeChooser();
    expect(useChoice.getState()).toMatchObject({ open: false, preview: { state: 'none' } });
  });
});
