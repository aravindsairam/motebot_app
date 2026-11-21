// The robot's messages as plain objects, decoded from the generated protobuf code. Screens and
// the store use these types only, never the generated classes, so a field that a newer gateway
// leaves out still arrives with a sensible value.

import { vacuum } from '../proto/vacuum';

const pb = vacuum.v1;

export const PROTOCOL_VERSION = pb.Protocol.PROTOCOL_VERSION;
export const CHANNEL_DATA = pb.Channel.CHANNEL_DATA;
export const CHANNEL_COMMAND = pb.Channel.CHANNEL_COMMAND;
export const DataType = pb.DataType;
export const CommandType = pb.CommandType;

export type ReplyResult = 'ok' | 'refused' | 'not_available' | 'timed_out' | 'bad_request' | 'busy' | 'error' | 'already_exists' | 'unknown';

export interface Reply {
  requestId: number;
  result: ReplyResult;
  message: string;
  goalId: Uint8Array; // GoTo, when accepted: the goal's id (16 bytes); empty otherwise
  estimate: CleaningEstimate | null; // PreviewCleaning, SaveCleaningPlan
  plans: CleaningPlanInfo[]; // ListCleaningPlans
  history: CleaningHistory | null; // ListCleaningHistory
  record: CleaningRecord | null; // GetCleaningRecord, with its picture
  replanned: boolean; // PreviewCleaning of a saved plan whose map has changed: its rows were planned again
  jobId: number; // StartCleaning or StartExploration, when accepted: the job's number, as in its status; 0 otherwise
}

const RESULTS: Record<number, ReplyResult> = {
  [pb.Reply.Result.RESULT_OK]: 'ok',
  [pb.Reply.Result.RESULT_REFUSED]: 'refused',
  [pb.Reply.Result.RESULT_NOT_AVAILABLE]: 'not_available',
  [pb.Reply.Result.RESULT_TIMED_OUT]: 'timed_out',
  [pb.Reply.Result.RESULT_BAD_REQUEST]: 'bad_request',
  [pb.Reply.Result.RESULT_BUSY]: 'busy',
  [pb.Reply.Result.RESULT_ERROR]: 'error',
  [pb.Reply.Result.RESULT_ALREADY_EXISTS]: 'already_exists',
};

export interface MapData {
  version: number;
  width: number; // cells
  height: number;
  resolution: number; // metres per cell
  originX: number; // map coordinates of the outer corner of cell (0, 0)
  originY: number;
  originYaw: number;
  cells: Int8Array; // row by row from cell (0, 0), rows going up in y; -1 unknown, 0 free, 100 occupied
}

export interface Pose {
  stamp: number; // robot clock, seconds
  x: number; // metres, map coordinates
  y: number;
  heading: number; // radians, counter-clockwise from the map's x axis
}

/** Map.cells_rle: pairs of (run length - 1, value as a signed byte). Throws unless it decodes
 *  to exactly `expected` cells. */
export function rleDecode(data: Uint8Array, expected: number): Int8Array {
  if (data.length % 2 !== 0) throw new Error('map cells: odd number of bytes');
  const out = new Int8Array(expected);
  let at = 0;
  for (let i = 0; i < data.length; i += 2) {
    const run = data[i] + 1;
    if (at + run > expected) throw new Error(`map cells: more than the ${expected} cells the map should have`);
    out.fill((data[i + 1] << 24) >> 24, at, at + run);
    at += run;
  }
  if (at !== expected) throw new Error(`map cells: ${at} cells instead of ${expected}`);
  return out;
}

export function decodeMap(payload: Uint8Array): MapData {
  const m = pb.Map.decode(payload);
  return {
    version: m.version,
    width: m.width,
    height: m.height,
    resolution: m.resolution,
    originX: m.originX,
    originY: m.originY,
    originYaw: m.originYaw,
    cells: rleDecode(m.cellsRle, m.width * m.height),
  };
}

export function decodeRobotPose(payload: Uint8Array): Pose {
  const m = pb.RobotPose.decode(payload);
  return { stamp: m.stamp, x: m.x, y: m.y, heading: m.heading };
}

export interface Route {
  stamp: number;
  points: Float32Array; // x0, y0, x1, y1, ... metres, map coordinates, robot first
}

export type NavState = 'none' | 'accepted' | 'on_the_way' | 'cancelling' | 'reached' | 'failed' | 'cancelled';

export interface NavigationStatus {
  goalId: Uint8Array;
  state: NavState;
  distanceRemaining: number; // metres, while on the way
}

const NAV_STATES: Record<number, NavState> = {
  [pb.NavigationStatus.State.STATE_NONE]: 'none',
  [pb.NavigationStatus.State.STATE_ACCEPTED]: 'accepted',
  [pb.NavigationStatus.State.STATE_ON_THE_WAY]: 'on_the_way',
  [pb.NavigationStatus.State.STATE_CANCELLING]: 'cancelling',
  [pb.NavigationStatus.State.STATE_REACHED]: 'reached',
  [pb.NavigationStatus.State.STATE_FAILED]: 'failed',
  [pb.NavigationStatus.State.STATE_CANCELLED]: 'cancelled',
};

export function decodeRoute(payload: Uint8Array): Route {
  const m = pb.Route.decode(payload);
  const points = new Float32Array(m.pointsCm.length);
  for (let i = 0; i < points.length; i++) points[i] = m.pointsCm[i] / 100;
  return { stamp: m.stamp, points };
}

export function decodeNavigationStatus(payload: Uint8Array): NavigationStatus {
  const m = pb.NavigationStatus.decode(payload);
  return { goalId: Uint8Array.from(m.goalId), state: NAV_STATES[m.state] ?? 'none', distanceRemaining: m.distanceRemaining };
}

/** A place the robot must never drive into: one of the no-go zones of the map in use. */
export interface NoGoZone {
  name: string;
  points: Float32Array; // the corners x0, y0, x1, y1, ... in metres, map coordinates
}

/** The no-go zones and the saved map they belong to ('' while no saved map is in use). */
export interface NoGoZones {
  mapName: string;
  zones: NoGoZone[];
}

export function decodeNoGoZones(payload: Uint8Array): NoGoZones {
  const m = pb.NoGoZones.decode(payload);
  const zones = m.zones.map((z) => {
    const cm = z.pointsCm ?? [];
    const points = new Float32Array(cm.length);
    for (let i = 0; i < points.length; i++) points[i] = cm[i] / 100;
    return { name: z.name ?? '', points };
  });
  return { mapName: m.mapName ?? '', zones };
}

/** Replace the zones of map `mapName` with these (corners in metres; sent in whole centimetres). */
export function encodeSetNoGoZones(requestId: number, mapName: string, zones: readonly { name: string; points: ArrayLike<number> }[]): Uint8Array {
  return pb.SetNoGoZones.encode({
    requestId,
    mapName,
    zones: zones.map((z) => ({ name: z.name, pointsCm: Array.from(z.points, (v) => Math.round(v * 100)) })),
  }).finish();
}

export function sameGoal(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (!a || !b || a.length !== b.length || a.length === 0) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function encodeGoTo(requestId: number, x: number, y: number, heading: number): Uint8Array {
  return pb.GoTo.encode({ requestId, x, y, heading }).finish();
}

/** An empty goal id cancels every goal. */
export function encodeCancelGoal(requestId: number, goalId: Uint8Array): Uint8Array {
  return pb.CancelGoal.encode({ requestId, goalId }).finish();
}

/** The joystick: forward speed (m/s) and turn speed (rad/s, to the left positive). */
export function encodeDrive(requestId: number, forward: number, turn: number): Uint8Array {
  return pb.Drive.encode({ requestId, forward, turn }).finish();
}

export function decodeReply(payload: Uint8Array): Reply {
  const m = pb.Reply.decode(payload);
  return {
    requestId: m.requestId,
    result: RESULTS[m.result] ?? 'unknown',
    message: m.message,
    goalId: Uint8Array.from(m.goalId),
    estimate: m.estimate ? estimateOf(m.estimate) : null,
    plans: (m.plans ?? []).map(planInfoOf),
    history: m.history ? historyOf(m.history) : null,
    record: m.record ? recordOf(m.record) : null,
    replanned: m.replanned === true,
    jobId: m.jobId ?? 0,
  };
}

export function encodePing(requestId: number): Uint8Array {
  return pb.Ping.encode({ requestId }).finish();
}

export function encodeChangeMode(requestId: number, mode: string): Uint8Array {
  return pb.ChangeMode.encode({ requestId, mode }).finish();
}

export function encodeSaveMap(requestId: number, name: string, replace: boolean): Uint8Array {
  return pb.SaveMap.encode({ requestId, name, replace }).finish();
}

export interface Hello {
  protocolVersion: number;
  robotName: string;
  gatewayVersion: string;
}

export interface RobotState {
  state: string;
  previousState: string;
  reason: string;
  transitioning: boolean;
  allowedTransitions: string[];
  faults: string[];
  currentMap: string;
  enteredTime: number; // robot clock, seconds
  // A map is being made (mapping, exploring, or a failsafe entered from either with the map still
  // there): leaving would lose it, and currentMap still names the older saved map. A gateway older
  // than this field sends nothing: the mode's name decides then.
  makingMap: boolean;
}

export interface SafetyStatus {
  source: string;
  blockedReason: string;
  cliff: boolean;
  bumper: boolean;
  offFloor: boolean;
  reflexActive: boolean;
  stale: string[];
}

export function decodeHello(payload: Uint8Array): Hello {
  const m = pb.Hello.decode(payload);
  return { protocolVersion: m.protocolVersion, robotName: m.robotName, gatewayVersion: m.gatewayVersion };
}

export function decodeHeartbeat(payload: Uint8Array): number {
  return pb.Heartbeat.decode(payload).sequence;
}

export function decodeRobotState(payload: Uint8Array): RobotState {
  const m = pb.RobotState.decode(payload);
  return {
    state: m.state,
    previousState: m.previousState,
    reason: m.reason,
    transitioning: m.transitioning,
    allowedTransitions: [...m.allowedTransitions],
    faults: [...m.faults],
    currentMap: m.currentMap,
    enteredTime: m.enteredTime,
    makingMap: m.makingMap || m.state === 'mapping' || m.state === 'exploring',
  };
}

export function decodeSafetyStatus(payload: Uint8Array): SafetyStatus {
  const m = pb.SafetyStatus.decode(payload);
  return {
    source: m.source,
    blockedReason: m.blockedReason,
    cliff: m.cliff,
    bumper: m.bumper,
    offFloor: m.offFloor,
    reflexActive: m.reflexActive,
    stale: [...m.stale],
  };
}

// ---------------------------------------------------------------- cleaning
// The robot's cleaning node plans, drives and records every clean; these carry its requests and
// reports. Stop is ChangeMode to idle and Dock is ChangeMode to docking. Metres, map coordinates.

export type CleaningWhat = 'everything' | 'area' | 'spot' | 'plan';
/** 'default' leaves it to the robot's own setting. */
export type CleaningOption = 'default' | 'off' | 'on';

/** What to clean and how. */
export interface CleaningJob {
  what: CleaningWhat;
  area: number[]; // corners x0, y0, x1, y1, ... metres (WHAT_AREA)
  spotX: number; // the middle of a spot clean (WHAT_SPOT)
  spotY: number;
  planName: string; // a saved plan (WHAT_PLAN)
  direction: string; // rows along "x" or "y"; "" for whichever needs fewer turns
  passes: number; // 1, or 2 for a second pass at right angles; 0 means 1
  edges: CleaningOption; // a pass along walls and furniture after the rows
  returnToDock: CleaningOption; // dock when finished
}

export interface CleaningEstimate {
  rows: number;
  edges: number;
  turns: number;
  transits: number;
  distance: number; // m
  plannedArea: number; // m2 of floor the plan passes over
  leftOutArea: number; // m2 it could reach but leaves
  unreachableArea: number; // m2 the robot cannot get to from where it is
  time: number; // s, expected
}

// starting: accepted and planned, switching to cleaning mode. ending: over, handing over to the
// next mode (docking or idle). finished, stopped, failed: how it ended, until the next job.
export type CleaningState = 'none' | 'starting' | 'cleaning' | 'paused' | 'ending' | 'finished' | 'stopped' | 'failed';

/** How the cleaning job is going, from where the robot has really been. After a job ends it
 *  keeps saying how that job ended until the next one. */
export interface CleaningStatus {
  state: CleaningState;
  message: string; // "row 12 of 31", or how it ended, in the robot's words
  jobId: number;
  target: string; // "everything", "area", "spot", or the saved plan's name
  job: CleaningJob;
  started: number; // seconds since 1970
  coverage: number; // percent of the planned floor cleaned
  cleanedArea: number; // m2
  plannedArea: number; // m2
  distance: number; // m
  cleaningTime: number; // s, paused time not counted
  timeLeft: number; // s, estimated
  rowsDone: number;
  rowsTotal: number;
  rowsSkipped: number;
  currentRow: number; // being driven or next; 0 when none are left
  edgesDone: number;
  edgesTotal: number;
  edgesSkipped: number;
  currentEdge: number;
  bumps: number;
  pauses: number;
  piece: number; // index in the plan's pieces of the one being driven; those before it are done
}

export type PieceKind = 'row' | 'connector' | 'transit' | 'edge';

/** One straight piece of a plan, in metres. */
export interface PlanPiece {
  kind: PieceKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  number: number; // rows and edges: their number from 1; 0 for the others
  passNumber: number;
}

/** The rows of the job running (jobId) or of the last preview (jobId 0). No pieces: neither. */
export interface CleaningPlan {
  jobId: number;
  target: string;
  pieces: PlanPiece[]; // in driving order
  estimate: CleaningEstimate;
}

/** The floor cleaned so far: the same size and place as the map. */
export interface CleanedArea {
  jobId: number;
  width: number;
  height: number;
  resolution: number;
  originX: number;
  originY: number;
  cells: Int8Array; // as MapData.cells: 100 cleaned, 0 not
}

export interface CleaningPlanInfo {
  name: string;
  job: CleaningJob;
  estimate: CleaningEstimate; // as when it was saved
  mapChanged: boolean; // the map has changed since: its rows will be planned again
  saved: number; // seconds since 1970
}

export interface CleaningRecord {
  id: string;
  started: number; // seconds since 1970
  ended: number;
  status: CleaningStatus; // as it stood at the end
  picture: Uint8Array; // PNG; only from GetCleaningRecord, empty otherwise
}

export interface CleaningTotals {
  cleans: number;
  area: number; // m2
  time: number; // s
  distance: number; // m
}

export interface CleaningHistory {
  records: CleaningRecord[]; // newest first
  totals: CleaningTotals; // every clean ever recorded on this map
}

const WHAT: Record<number, CleaningWhat> = {
  [pb.CleaningJob.What.WHAT_EVERYTHING]: 'everything',
  [pb.CleaningJob.What.WHAT_AREA]: 'area',
  [pb.CleaningJob.What.WHAT_SPOT]: 'spot',
  [pb.CleaningJob.What.WHAT_PLAN]: 'plan',
};
const WHAT_NUMBER: Record<CleaningWhat, number> = {
  everything: pb.CleaningJob.What.WHAT_EVERYTHING,
  area: pb.CleaningJob.What.WHAT_AREA,
  spot: pb.CleaningJob.What.WHAT_SPOT,
  plan: pb.CleaningJob.What.WHAT_PLAN,
};
const OPTION: Record<number, CleaningOption> = {
  [pb.CleaningJob.Option.OPTION_DEFAULT]: 'default',
  [pb.CleaningJob.Option.OPTION_OFF]: 'off',
  [pb.CleaningJob.Option.OPTION_ON]: 'on',
};
const OPTION_NUMBER: Record<CleaningOption, number> = {
  default: pb.CleaningJob.Option.OPTION_DEFAULT,
  off: pb.CleaningJob.Option.OPTION_OFF,
  on: pb.CleaningJob.Option.OPTION_ON,
};
const CLEANING_STATES: Record<number, CleaningState> = {
  [pb.CleaningStatus.State.STATE_NONE]: 'none',
  [pb.CleaningStatus.State.STATE_STARTING]: 'starting',
  [pb.CleaningStatus.State.STATE_CLEANING]: 'cleaning',
  [pb.CleaningStatus.State.STATE_PAUSED]: 'paused',
  [pb.CleaningStatus.State.STATE_FINISHED]: 'finished',
  [pb.CleaningStatus.State.STATE_STOPPED]: 'stopped',
  [pb.CleaningStatus.State.STATE_FAILED]: 'failed',
  [pb.CleaningStatus.State.STATE_ENDING]: 'ending',
};
const PIECE_KINDS: Record<number, PieceKind> = {
  [pb.CleaningPlan.Kind.KIND_ROW]: 'row',
  [pb.CleaningPlan.Kind.KIND_CONNECTOR]: 'connector',
  [pb.CleaningPlan.Kind.KIND_TRANSIT]: 'transit',
  [pb.CleaningPlan.Kind.KIND_EDGE]: 'edge',
};

// Nested messages arrive as the generated classes, whose fields the types call optional: every
// field is read with a fallback, so a field a newer gateway leaves out still has a sensible value.

function jobOf(m: vacuum.v1.CleaningJob.$Properties | null | undefined): CleaningJob {
  return {
    what: WHAT[m?.what ?? 0] ?? 'everything',
    area: [...(m?.area ?? [])],
    spotX: m?.spotX ?? 0,
    spotY: m?.spotY ?? 0,
    planName: m?.planName ?? '',
    direction: m?.direction ?? '',
    passes: m?.passes ?? 0,
    edges: OPTION[m?.edges ?? 0] ?? 'default',
    returnToDock: OPTION[m?.returnToDock ?? 0] ?? 'default',
  };
}

function estimateOf(m: vacuum.v1.CleaningEstimate.$Properties | null | undefined): CleaningEstimate {
  return {
    rows: m?.rows ?? 0,
    edges: m?.edges ?? 0,
    turns: m?.turns ?? 0,
    transits: m?.transits ?? 0,
    distance: m?.distance ?? 0,
    plannedArea: m?.plannedArea ?? 0,
    leftOutArea: m?.leftOutArea ?? 0,
    unreachableArea: m?.unreachableArea ?? 0,
    time: m?.time ?? 0,
  };
}

function statusOf(m: vacuum.v1.CleaningStatus.$Properties | null | undefined): CleaningStatus {
  return {
    state: CLEANING_STATES[m?.state ?? 0] ?? 'none',
    message: m?.message ?? '',
    jobId: m?.jobId ?? 0,
    target: m?.target ?? '',
    job: jobOf(m?.job),
    started: m?.started ?? 0,
    coverage: m?.coverage ?? 0,
    cleanedArea: m?.cleanedArea ?? 0,
    plannedArea: m?.plannedArea ?? 0,
    distance: m?.distance ?? 0,
    cleaningTime: m?.cleaningTime ?? 0,
    timeLeft: m?.timeLeft ?? 0,
    rowsDone: m?.rowsDone ?? 0,
    rowsTotal: m?.rowsTotal ?? 0,
    rowsSkipped: m?.rowsSkipped ?? 0,
    currentRow: m?.currentRow ?? 0,
    edgesDone: m?.edgesDone ?? 0,
    edgesTotal: m?.edgesTotal ?? 0,
    edgesSkipped: m?.edgesSkipped ?? 0,
    currentEdge: m?.currentEdge ?? 0,
    bumps: m?.bumps ?? 0,
    pauses: m?.pauses ?? 0,
    piece: m?.piece ?? 0,
  };
}

function planInfoOf(m: vacuum.v1.CleaningPlanInfo.$Properties): CleaningPlanInfo {
  return { name: m.name ?? '', job: jobOf(m.job), estimate: estimateOf(m.estimate), mapChanged: m.mapChanged === true, saved: m.saved ?? 0 };
}

function recordOf(m: vacuum.v1.CleaningRecord.$Properties): CleaningRecord {
  return {
    id: m.id ?? '',
    started: m.started ?? 0,
    ended: m.ended ?? 0,
    status: statusOf(m.status),
    picture: m.picturePng ? Uint8Array.from(m.picturePng) : new Uint8Array(0),
  };
}

function historyOf(m: vacuum.v1.CleaningHistory.$Properties): CleaningHistory {
  const t = m.totals;
  return {
    records: (m.records ?? []).map(recordOf),
    totals: { cleans: t?.cleans ?? 0, area: t?.area ?? 0, time: t?.time ?? 0, distance: t?.distance ?? 0 },
  };
}

export function decodeCleaningStatus(payload: Uint8Array): CleaningStatus {
  return statusOf(pb.CleaningStatus.decode(payload));
}

export function decodeCleaningPlan(payload: Uint8Array): CleaningPlan {
  const m = pb.CleaningPlan.decode(payload);
  return {
    jobId: m.jobId,
    target: m.target,
    pieces: (m.pieces ?? []).map((p) => ({
      kind: PIECE_KINDS[p.kind ?? 0] ?? 'transit', // a kind added later is drawn as the faintest
      x0: (p.x0Cm ?? 0) / 100,
      y0: (p.y0Cm ?? 0) / 100,
      x1: (p.x1Cm ?? 0) / 100,
      y1: (p.y1Cm ?? 0) / 100,
      number: p.number ?? 0,
      passNumber: p.passNumber ?? 0,
    })),
    estimate: estimateOf(m.estimate),
  };
}

export function decodeCleanedArea(payload: Uint8Array): CleanedArea {
  const m = pb.CleanedArea.decode(payload);
  return {
    jobId: m.jobId,
    width: m.width,
    height: m.height,
    resolution: m.resolution,
    originX: m.originX,
    originY: m.originY,
    cells: rleDecode(m.cellsRle, m.width * m.height),
  };
}

function jobMessage(job: CleaningJob): vacuum.v1.CleaningJob.$Properties {
  return {
    what: WHAT_NUMBER[job.what],
    area: job.area,
    spotX: job.spotX,
    spotY: job.spotY,
    planName: job.planName,
    direction: job.direction,
    passes: job.passes,
    edges: OPTION_NUMBER[job.edges],
    returnToDock: OPTION_NUMBER[job.returnToDock],
  };
}

export function encodeStartCleaning(requestId: number, job: CleaningJob): Uint8Array {
  return pb.StartCleaning.encode({ requestId, job: jobMessage(job) }).finish();
}

/** Pause the clean, or resume it. */
export function encodePauseCleaning(requestId: number, resume: boolean): Uint8Array {
  return pb.PauseCleaning.encode({ requestId, resume }).finish();
}

export function encodePreviewCleaning(requestId: number, job: CleaningJob): Uint8Array {
  return pb.PreviewCleaning.encode({ requestId, job: jobMessage(job) }).finish();
}

export function encodeSaveCleaningPlan(requestId: number, name: string, job: CleaningJob, replace: boolean): Uint8Array {
  return pb.SaveCleaningPlan.encode({ requestId, name, job: jobMessage(job), replace }).finish();
}

export function encodeListCleaningPlans(requestId: number): Uint8Array {
  return pb.ListCleaningPlans.encode({ requestId }).finish();
}

export function encodeDeleteCleaningPlan(requestId: number, name: string): Uint8Array {
  return pb.DeleteCleaningPlan.encode({ requestId, name }).finish();
}

/** maxRecords 0: every record the robot keeps. */
export function encodeListCleaningHistory(requestId: number, maxRecords: number): Uint8Array {
  return pb.ListCleaningHistory.encode({ requestId, maxRecords }).finish();
}

export function encodeGetCleaningRecord(requestId: number, id: string): Uint8Array {
  return pb.GetCleaningRecord.encode({ requestId, id }).finish();
}

// ---------------------------------------------------------------- exploring
// The robot maps the house by itself; its exploration node reports how it goes. Stop is ChangeMode
// to idle, which the robot carries out as a change to mapping: the map is kept.

// starting: switching to mapping, then exploring. returning: nothing left to look at, driving back
// to where it started. ending: handing back to mapping. finished, stopped, failed: how it ended.
export type ExplorationState = 'none' | 'starting' | 'exploring' | 'returning' | 'ending' | 'finished' | 'stopped' | 'failed';

export interface ExplorationStatus {
  state: ExplorationState;
  message: string; // what it is doing, or how it ended, in the robot's words
  jobId: number;
  started: number; // seconds since 1970
  placesLeft: number;
  mappedArea: number; // m2 of floor on the map so far
  exploringTime: number; // s of robot time
  timeLimit: number; // s of robot time
  distance: number; // m
  goalsSent: number;
  goalsFailed: number;
}

/** The places still to look at. Metres, map coordinates. */
export interface Frontiers {
  jobId: number;
  points: { x: number; y: number }[];
}

const EXPLORATION_STATES: Record<number, ExplorationState> = {
  [pb.ExplorationStatus.State.STATE_NONE]: 'none',
  [pb.ExplorationStatus.State.STATE_STARTING]: 'starting',
  [pb.ExplorationStatus.State.STATE_EXPLORING]: 'exploring',
  [pb.ExplorationStatus.State.STATE_RETURNING]: 'returning',
  [pb.ExplorationStatus.State.STATE_ENDING]: 'ending',
  [pb.ExplorationStatus.State.STATE_FINISHED]: 'finished',
  [pb.ExplorationStatus.State.STATE_STOPPED]: 'stopped',
  [pb.ExplorationStatus.State.STATE_FAILED]: 'failed',
};

export function decodeExplorationStatus(payload: Uint8Array): ExplorationStatus {
  const m = pb.ExplorationStatus.decode(payload);
  return {
    state: EXPLORATION_STATES[m.state] ?? 'none',
    message: m.message,
    jobId: m.jobId,
    started: m.started,
    placesLeft: m.placesLeft,
    mappedArea: m.mappedArea,
    exploringTime: m.exploringTime,
    timeLimit: m.timeLimit,
    distance: m.distance,
    goalsSent: m.goalsSent,
    goalsFailed: m.goalsFailed,
  };
}

export function decodeFrontiers(payload: Uint8Array): Frontiers {
  const m = pb.Frontiers.decode(payload);
  const points: { x: number; y: number }[] = [];
  const cm = m.pointsCm ?? [];
  for (let i = 0; i + 1 < cm.length; i += 2) points.push({ x: cm[i] / 100, y: cm[i + 1] / 100 });
  return { jobId: m.jobId, points };
}

/** Start an exploration; `timeLimit` in seconds of robot time, 0 for the robot's default. */
export function encodeStartExploration(requestId: number, timeLimit: number): Uint8Array {
  return pb.StartExploration.encode({ requestId, timeLimit }).finish();
}
