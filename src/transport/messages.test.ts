// Both ends agree: these files were written by the gateway's own Python code (vacuum_gateway/
// samples.py, through tools/gen_proto.sh). The expected values below are the ones it wrote.

import * as fs from 'fs';
import * as path from 'path';

import { decodeFrame, encodeFrame } from './framing';
import {
  CHANNEL_COMMAND,
  CHANNEL_DATA,
  CommandType,
  DataType,
  type CleaningJob,
  decodeCleanedArea,
  decodeCleaningPlan,
  decodeCleaningStatus,
  decodeExplorationStatus,
  decodeFrontiers,
  decodeHeartbeat,
  decodeHello,
  decodeMap,
  decodeNavigationStatus,
  decodeNoGoZones,
  decodeReply,
  decodeRobotPose,
  decodeRoute,
  decodeRobotState,
  decodeSafetyStatus,
  encodeCancelGoal,
  encodeChangeMode,
  encodeDeleteCleaningPlan,
  encodeDrive,
  encodeGetCleaningRecord,
  encodeGoTo,
  encodeListCleaningHistory,
  encodeListCleaningPlans,
  encodePauseCleaning,
  encodePing,
  encodePreviewCleaning,
  encodeSaveCleaningPlan,
  encodeSaveMap,
  encodeSetNoGoZones,
  encodeStartExploration,
  encodeStartCleaning,
  PROTOCOL_VERSION,
  rleDecode,
} from './messages';

const SAMPLES = path.join(__dirname, '..', '..', '..', 'proto', 'samples');
// The samples are kept in the main project, beside this folder. When this folder is used alone
// they are not there, and the tests that read them are skipped.
const describeWithSamples = fs.existsSync(SAMPLES) ? describe : describe.skip;
// SAMPLE_GOAL_ID in vacuum_gateway/samples.py: bytes 0xa0 to 0xaf
const GOAL_ID = Uint8Array.from({ length: 16 }, (_, i) => 0xa0 + i);

// The cleaning samples' job, estimate and status (`job`, `estimate`, `status` in samples.py).
const AREA_JOB: CleaningJob = {
  what: 'area',
  area: [1.2, 0.2, 3.2, 0.2, 3.2, 1.4, 1.2, 1.4],
  spotX: 0,
  spotY: 0,
  planName: '',
  direction: '',
  passes: 2,
  edges: 'on',
  returnToDock: 'off',
};
const SPOT_JOB: CleaningJob = {
  what: 'spot',
  area: [],
  spotX: 2.5,
  spotY: -1.25,
  planName: '',
  direction: '',
  passes: 0,
  edges: 'default',
  returnToDock: 'off',
};
const ESTIMATE = {
  rows: 31,
  edges: 12,
  turns: 64,
  transits: 3,
  distance: 88.5,
  plannedArea: 21.25,
  leftOutArea: 0.5,
  unreachableArea: 1.75,
  time: 840,
};
const STATUS = {
  state: 'cleaning',
  message: 'row 12 of 31',
  jobId: 7,
  target: 'Living room é',
  job: AREA_JOB,
  started: 1794988290.5,
  coverage: 43.5,
  cleanedArea: 9.125,
  plannedArea: 21.25,
  distance: 38.25,
  cleaningTime: 370,
  timeLeft: 360,
  rowsDone: 11,
  rowsTotal: 31,
  rowsSkipped: 1,
  currentRow: 12,
  edgesDone: 0,
  edgesTotal: 12,
  edgesSkipped: 0,
  currentEdge: 1,
  bumps: 2,
  pauses: 1,
  piece: 23,
};
// The same numbers, as the job ended (`finished` in samples.py: a stopped job)
const ENDED = { ...STATUS, state: 'stopped', message: 'stopped: the robot left cleaning mode (now idle)', currentRow: 0, currentEdge: 0, timeLeft: 0 };

function sample(name: string, type: number) {
  const frame = decodeFrame(new Uint8Array(fs.readFileSync(path.join(SAMPLES, name))), 1 << 20);
  expect(frame.channel).toBe(CHANNEL_DATA);
  expect(frame.type).toBe(type);
  return frame.payload;
}

describeWithSamples('messages written by the gateway', () => {
  it('Reply: the name is taken', () => {
    expect(decodeReply(sample('reply_name_taken.bin', DataType.DATA_REPLY))).toMatchObject({
      requestId: 48,
      result: 'already_exists',
      message: "a map named 'house' already exists; save with replace to overwrite it",
    });
  });

  it('NoGoZones, in metres', () => {
    const { zones, mapName } = decodeNoGoZones(sample('no_go_zones.bin', DataType.DATA_NO_GO_ZONES));
    expect(mapName).toBe('house');
    expect(zones.map((z) => z.name)).toEqual(['stairwell', 'rug é']);
    expect(Array.from(zones[0].points)).toEqual([4.55, 2, 5.65, 2, 5.65, 3.3, 4.55, 3.3].map(Math.fround));
    expect(Array.from(zones[1].points)).toEqual([-1, -0.5, 0, 0, -0.5, 1]);
  });

  it('Hello', () => {
    expect(decodeHello(sample('hello.bin', DataType.DATA_HELLO))).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      robotName: 'Vacuum',
      gatewayVersion: '0.1.0',
    });
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('Heartbeat', () => {
    expect(decodeHeartbeat(sample('heartbeat.bin', DataType.DATA_HEARTBEAT))).toBe(7);
  });

  it('RobotState, with lists and text outside ASCII', () => {
    expect(decodeRobotState(sample('robot_state.bin', DataType.DATA_ROBOT_STATE))).toEqual({
      state: 'docking',
      previousState: 'navigation',
      reason: 'docking: final approach (0.4 m, 2°)',
      transitioning: false,
      allowedTransitions: ['idle', 'mapping', 'navigation', 'manual', 'failsafe'],
      faults: [],
      currentMap: 'house',
      enteredTime: 1234.5,
      makingMap: false,
    });
  });

  it('RobotState in failsafe, with empty fields left out on the wire', () => {
    expect(decodeRobotState(sample('robot_state_failsafe.bin', DataType.DATA_ROBOT_STATE))).toEqual({
      state: 'failsafe',
      previousState: 'manual',
      reason: 'fault: lidar data stopped',
      transitioning: true,
      allowedTransitions: [],
      faults: ['lidar data stopped', 'bumper data stopped'],
      currentMap: '',
      enteredTime: 0,
      makingMap: false,
    });
  });

  it('RobotState while exploring: a map is being made, the older saved map still named', () => {
    expect(decodeRobotState(sample('robot_state_exploring.bin', DataType.DATA_ROBOT_STATE))).toMatchObject({
      state: 'exploring',
      previousState: 'mapping',
      currentMap: 'house',
      makingMap: true,
      allowedTransitions: ['mapping', 'idle', 'failsafe'],
    });
  });

  it('ExplorationStatus', () => {
    expect(decodeExplorationStatus(sample('exploration_status.bin', DataType.DATA_EXPLORATION_STATUS))).toEqual({
      state: 'exploring',
      message: 'looking again: making sure nothing is left',
      jobId: 4,
      started: 1794988290.5,
      placesLeft: 3,
      mappedArea: 18.25,
      exploringTime: 130.5,
      timeLimit: 1200,
      distance: 12.5,
      goalsSent: 6,
      goalsFailed: 1,
    });
  });

  it('Frontiers: the places still to look at, in metres', () => {
    expect(decodeFrontiers(sample('frontiers.bin', DataType.DATA_FRONTIERS))).toEqual({
      jobId: 4,
      points: [
        { x: 1.25, y: -0.5 },
        { x: 6.05, y: 2.4 },
      ],
    });
  });

  it('Reply to StartExploration: the exploration\'s number', () => {
    expect(decodeReply(sample('reply_start_exploration.bin', DataType.DATA_REPLY))).toMatchObject({
      requestId: 70,
      result: 'ok',
      message: 'exploring: a new map begins',
      jobId: 4,
    });
  });

  it('SafetyStatus', () => {
    expect(decodeSafetyStatus(sample('safety_status.bin', DataType.DATA_SAFETY_STATUS))).toEqual({
      source: 'nav2',
      blockedReason: 'cliff ahead',
      cliff: true,
      bumper: false,
      offFloor: false,
      reflexActive: true,
      stale: ['bumper'],
    });
  });

  it('Reply', () => {
    expect(decodeReply(sample('reply.bin', DataType.DATA_REPLY))).toEqual({
      requestId: 42,
      result: 'refused',
      message: 'no saved map yet: switch to mapping, drive around, and save a map first',
      goalId: new Uint8Array(0),
      estimate: null,
      plans: [],
      history: null,
      record: null,
      replanned: false,
      jobId: 0,
    });
  });

  it('Reply to GoTo, with the goal id', () => {
    expect(decodeReply(sample('reply_go_to.bin', DataType.DATA_REPLY))).toEqual({
      requestId: 43,
      result: 'ok',
      message: 'on the way',
      goalId: GOAL_ID,
      estimate: null,
      plans: [],
      history: null,
      record: null,
      replanned: false,
      jobId: 0,
    });
  });

  it('Route, in metres', () => {
    const route = decodeRoute(sample('route.bin', DataType.DATA_ROUTE));
    expect(route.stamp).toBe(1234.5);
    expect([...route.points].map((v) => Math.round(v * 100))).toEqual([0, 0, 5, 0, 123, -250]);
  });

  it('NavigationStatus', () => {
    expect(decodeNavigationStatus(sample('navigation_status.bin', DataType.DATA_NAVIGATION))).toEqual({
      goalId: GOAL_ID,
      state: 'on_the_way',
      distanceRemaining: 3.25,
    });
  });

  it('Map, with a run longer than 256 cells and every kind of cell', () => {
    const map = decodeMap(sample('map.bin', DataType.DATA_MAP));
    expect({ ...map, cells: undefined }).toEqual({
      version: 3,
      width: 20,
      height: 15,
      resolution: expect.closeTo(0.05, 6),
      originX: -1.25,
      originY: -2.5,
      originYaw: 0,
      cells: undefined,
    });
    // the same cells as SAMPLE_MAP_CELLS in vacuum_gateway/samples.py
    const expected = [...new Array(270).fill(-1), ...new Array(20).fill(0), ...new Array(5).fill(100), 50, 0, 100, -1, 0];
    expect([...map.cells]).toEqual(expected);
  });

  it('RobotPose', () => {
    expect(decodeRobotPose(sample('robot_pose.bin', DataType.DATA_ROBOT_POSE))).toEqual({ stamp: 1234.5, x: 1.25, y: -0.5, heading: 1.5 });
  });

  it('CleaningStatus, every field', () => {
    expect(decodeCleaningStatus(sample('cleaning_status.bin', DataType.DATA_CLEANING_STATUS))).toEqual(STATUS);
  });

  it('CleaningStatus while ending: the job is over, the robot hands over to the next mode', () => {
    expect(decodeCleaningStatus(sample('cleaning_status_ending.bin', DataType.DATA_CLEANING_STATUS))).toEqual({
      ...STATUS,
      state: 'ending',
      message: 'ending: going back to the dock',
      currentRow: 0,
      currentEdge: 0,
      piece: 0,
      timeLeft: 0,
    });
  });

  it('CleaningPlan, empty: no job and no preview, the rows go away', () => {
    expect(decodeCleaningPlan(sample('cleaning_plan_empty.bin', DataType.DATA_CLEANING_PLAN))).toEqual({
      jobId: 0,
      target: '',
      pieces: [],
      estimate: { rows: 0, edges: 0, turns: 0, transits: 0, distance: 0, plannedArea: 0, leftOutArea: 0, unreachableArea: 0, time: 0 },
    });
  });

  it('Reply to StartCleaning: the job number and the estimate', () => {
    expect(decodeReply(sample('reply_start_cleaning.bin', DataType.DATA_REPLY))).toEqual({
      requestId: 59,
      result: 'ok',
      message: '31 rows, 88 m, about 14 min',
      goalId: new Uint8Array(0),
      estimate: ESTIMATE,
      plans: [],
      history: null,
      record: null,
      replanned: false,
      jobId: 7,
    });
  });

  it('CleaningPlan: the pieces in driving order, in metres', () => {
    const plan = decodeCleaningPlan(sample('cleaning_plan.bin', DataType.DATA_CLEANING_PLAN));
    expect(plan).toMatchObject({ jobId: 7, target: 'area', estimate: ESTIMATE });
    const cm = (v: number) => Math.round(v * 100);
    expect(plan.pieces.map((p) => [p.kind, cm(p.x0), cm(p.y0), cm(p.x1), cm(p.y1), p.number, p.passNumber])).toEqual([
      ['transit', 0, 0, 123, 22, 0, 0],
      ['row', 123, 22, 318, 22, 1, 1],
      ['connector', 318, 22, 318, 48, 0, 1],
      ['row', 318, 48, 123, 48, 2, 1],
      ['edge', 100, -50, -150, -50, 1, 0],
    ]);
  });

  it('CleanedArea: placed like the map, cells decoded', () => {
    const area = decodeCleanedArea(sample('cleaned_area.bin', DataType.DATA_CLEANED_AREA));
    expect({ ...area, cells: undefined }).toEqual({
      jobId: 7,
      width: 20,
      height: 15,
      resolution: expect.closeTo(0.05, 6),
      originX: -1.25,
      originY: -2.5,
      cells: undefined,
    });
    expect([...area.cells]).toEqual([...new Array(200).fill(0), ...new Array(70).fill(100), ...new Array(30).fill(0)]);
  });

  it('Reply to a preview: the estimate, and that the rows were planned again', () => {
    expect(decodeReply(sample('reply_preview.bin', DataType.DATA_REPLY))).toEqual({
      requestId: 50,
      result: 'ok',
      message: 'the map has changed since this plan was saved: its rows were planned again',
      goalId: new Uint8Array(0),
      estimate: ESTIMATE,
      plans: [],
      history: null,
      record: null,
      replanned: true,
      jobId: 0,
    });
  });

  it('Reply with the saved plans', () => {
    const reply = decodeReply(sample('reply_plans.bin', DataType.DATA_REPLY));
    expect(reply).toMatchObject({ requestId: 51, result: 'ok', estimate: null, history: null, record: null, replanned: false });
    expect(reply.plans).toEqual([{ name: 'Under the table', job: AREA_JOB, estimate: ESTIMATE, mapChanged: true, saved: 1794988000.25 }]);
  });

  it('Reply with the history: records without pictures, and the totals', () => {
    const reply = decodeReply(sample('reply_history.bin', DataType.DATA_REPLY));
    expect(reply).toMatchObject({ requestId: 52, result: 'ok', plans: [], record: null });
    expect(reply.history).toEqual({
      records: [{ id: '20261118-101500-7', started: 1794988290.5, ended: 1794989130.75, status: ENDED, picture: new Uint8Array(0) }],
      totals: { cleans: 23, area: 412.5, time: 18600, distance: 1520.25 },
    });
  });

  it('Reply with one record and its picture', () => {
    const reply = decodeReply(sample('reply_record.bin', DataType.DATA_REPLY));
    expect(reply).toMatchObject({ requestId: 53, result: 'ok', history: null });
    expect(reply.record).toEqual({
      id: '20261118-101500-7',
      started: 1794988290.5,
      ended: 1794989130.75,
      status: ENDED,
      picture: Uint8Array.from({ length: 16 }, (_, i) => i),
    });
  });

  it('every sample on disk is covered by a test', () => {
    expect(fs.readdirSync(SAMPLES).sort()).toEqual([
      'cleaned_area.bin',
      'cleaning_plan.bin',
      'cleaning_plan_empty.bin',
      'cleaning_status.bin',
      'cleaning_status_ending.bin',
      'command_cancel_goal.bin',
      'command_change_mode.bin',
      'command_delete_cleaning_plan.bin',
      'command_drive.bin',
      'command_get_cleaning_record.bin',
      'command_go_to.bin',
      'command_list_cleaning_history.bin',
      'command_list_cleaning_plans.bin',
      'command_pause_cleaning.bin',
      'command_ping.bin',
      'command_preview_cleaning.bin',
      'command_save_cleaning_plan.bin',
      'command_save_map.bin',
      'command_set_no_go_zones.bin',
      'command_start_cleaning.bin',
      'command_start_exploration.bin',
      'exploration_status.bin',
      'frontiers.bin',
      'heartbeat.bin',
      'hello.bin',
      'map.bin',
      'navigation_status.bin',
      'no_go_zones.bin',
      'reply.bin',
      'reply_go_to.bin',
      'reply_history.bin',
      'reply_name_taken.bin',
      'reply_plans.bin',
      'reply_preview.bin',
      'reply_record.bin',
      'reply_start_cleaning.bin',
      'reply_start_exploration.bin',
      'robot_pose.bin',
      'robot_state.bin',
      'robot_state_exploring.bin',
      'robot_state_failsafe.bin',
      'route.bin',
      'safety_status.bin',
    ]);
  });
});

describe('map cells', () => {
  it('decodes runs, values as signed bytes', () => {
    expect([...rleDecode(new Uint8Array([2, 0, 0, 100, 1, 0xff]), 6)]).toEqual([0, 0, 0, 100, -1, -1]);
  });

  it('refuses data that does not make exactly width x height cells', () => {
    expect(() => rleDecode(new Uint8Array([2, 0]), 4)).toThrow(/3 cells instead of 4/);
    expect(() => rleDecode(new Uint8Array([9, 0]), 4)).toThrow(/more than the 4 cells/);
    expect(() => rleDecode(new Uint8Array([1]), 2)).toThrow(/odd/);
  });
});

describeWithSamples('commands written by the app', () => {
  // The same commands as the gateway's samples: the bytes must be identical.
  const onDisk = (name: string) => new Uint8Array(fs.readFileSync(path.join(SAMPLES, name)));

  it('ChangeMode', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_CHANGE_MODE, encodeChangeMode(42, 'docking'), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_change_mode.bin')]);
  });

  it('GoTo', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_GO_TO, encodeGoTo(44, 1.5, -0.25, -1.25), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_go_to.bin')]);
  });

  it('CancelGoal', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_CANCEL_GOAL, encodeCancelGoal(45, GOAL_ID), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_cancel_goal.bin')]);
  });

  it('SaveMap', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_SAVE_MAP, encodeSaveMap(47, 'upstairs-2', true), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_save_map.bin')]);
  });

  it('SetNoGoZones: corners in metres go as whole centimetres', () => {
    const zones = [
      { name: 'stairwell', points: [4.55, 2, 5.65, 2, 5.65, 3.3, 4.55, 3.3] },
      { name: 'rug é', points: [-1, -0.5, 0, 0, -0.5, 1] },
    ];
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_SET_NO_GO_ZONES, encodeSetNoGoZones(68, 'house', zones), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_set_no_go_zones.bin')]);
  });

  it('Drive', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_DRIVE, encodeDrive(46, 0.25, -1.5), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_drive.bin')]);
  });

  it('StartCleaning, an area with every option set', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_START_CLEANING, encodeStartCleaning(60, AREA_JOB), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_start_cleaning.bin')]);
  });

  it('StartExploration, with a time limit', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_START_EXPLORATION, encodeStartExploration(71, 120), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_start_exploration.bin')]);
  });

  it('PauseCleaning, to resume', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_PAUSE_CLEANING, encodePauseCleaning(61, true), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_pause_cleaning.bin')]);
  });

  it('PreviewCleaning, a spot', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_PREVIEW_CLEANING, encodePreviewCleaning(62, SPOT_JOB), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_preview_cleaning.bin')]);
  });

  it('SaveCleaningPlan', () => {
    const frame = encodeFrame(
      CHANNEL_COMMAND,
      CommandType.COMMAND_SAVE_CLEANING_PLAN,
      encodeSaveCleaningPlan(63, 'Under the table', AREA_JOB, true),
      1 << 20,
    );
    expect([...frame]).toEqual([...onDisk('command_save_cleaning_plan.bin')]);
  });

  it('ListCleaningPlans', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_LIST_CLEANING_PLANS, encodeListCleaningPlans(64), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_list_cleaning_plans.bin')]);
  });

  it('DeleteCleaningPlan', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_DELETE_CLEANING_PLAN, encodeDeleteCleaningPlan(65, 'Hall'), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_delete_cleaning_plan.bin')]);
  });

  it('ListCleaningHistory', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_LIST_CLEANING_HISTORY, encodeListCleaningHistory(66, 20), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_list_cleaning_history.bin')]);
  });

  it('GetCleaningRecord', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_GET_CLEANING_RECORD, encodeGetCleaningRecord(67, '20261118-101500-7'), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_get_cleaning_record.bin')]);
  });

  it('Ping, with a request number that needs all 32 bits', () => {
    const frame = encodeFrame(CHANNEL_COMMAND, CommandType.COMMAND_PING, encodePing(4000000000), 1 << 20);
    expect([...frame]).toEqual([...onDisk('command_ping.bin')]);
  });
});
