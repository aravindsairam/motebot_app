// A stand-in for the phone's WebSocket, for tests: it records what the code does to it, and the
// test makes things happen to it (messages arriving, the connection dropping).

import { vacuum } from '../proto/vacuum';
import type { SocketLike } from './connection';
import { encodeFrame } from './framing';

const pb = vacuum.v1;

export class TestSocket implements SocketLike {
  static made: TestSocket[] = [];
  static create = (url: string): SocketLike => new TestSocket(url);
  static latest(): TestSocket {
    return TestSocket.made[TestSocket.made.length - 1];
  }

  binaryType = 'blob';
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  closedWith: { code?: number; reason?: string } | null = null;
  sent: Uint8Array[] = [];

  constructor(readonly url: string) {
    TestSocket.made.push(this);
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
  }

  // --- things the test makes happen
  deliver(frame: Uint8Array): void {
    this.onmessage?.({ data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) });
  }

  fail(message: string): void {
    this.onerror?.({ message });
    this.onclose?.({ code: 1006, reason: '' });
  }
}

export function dataFrame(type: number, payload: Uint8Array): Uint8Array {
  return encodeFrame(pb.Channel.CHANNEL_DATA, type, payload, 1 << 20);
}

export function helloFrame(protocolVersion = 1): Uint8Array {
  return dataFrame(
    pb.DataType.DATA_HELLO,
    pb.Hello.encode({ protocolVersion, robotName: 'Test robot', gatewayVersion: '9.9' }).finish(),
  );
}

export function heartbeatFrame(sequence = 1): Uint8Array {
  return dataFrame(pb.DataType.DATA_HEARTBEAT, pb.Heartbeat.encode({ sequence }).finish());
}

export function robotStateFrame(state: string, more: { currentMap?: string; allowedTransitions?: string[] } = {}): Uint8Array {
  return dataFrame(pb.DataType.DATA_ROBOT_STATE, pb.RobotState.encode({ state, reason: 'test', ...more }).finish());
}

export function safetyFrame(source: string): Uint8Array {
  return dataFrame(pb.DataType.DATA_SAFETY_STATUS, pb.SafetyStatus.encode({ source }).finish());
}

export const ReplyResult = pb.Reply.Result;

/** A 2 x 2 map, cells given as run-length pairs. */
export function mapFrame(version: number, cellsRle: number[] = [3, 0]): Uint8Array {
  return dataFrame(
    pb.DataType.DATA_MAP,
    pb.Map.encode({ version, width: 2, height: 2, resolution: 0.05, originX: 0, originY: 0, cellsRle: new Uint8Array(cellsRle) }).finish(),
  );
}

export function poseFrame(x: number, y: number): Uint8Array {
  return dataFrame(pb.DataType.DATA_ROBOT_POSE, pb.RobotPose.encode({ stamp: 1, x, y, heading: 0 }).finish());
}

export function replyFrame(requestId: number, result: number, message = '', goalId?: Uint8Array): Uint8Array {
  return dataFrame(pb.DataType.DATA_REPLY, pb.Reply.encode({ requestId, result, message, goalId }).finish());
}

/** A Reply with more in it: an estimate, plans, history, a record, a job number. */
export function replyWith(requestId: number, result: number, message: string, more: vacuum.v1.Reply.$Properties): Uint8Array {
  return dataFrame(pb.DataType.DATA_REPLY, pb.Reply.encode({ ...more, requestId, result, message }).finish());
}

export const CleaningState = pb.CleaningStatus.State;
export const PieceKind = pb.CleaningPlan.Kind;

export function cleaningStatusFrame(status: vacuum.v1.CleaningStatus.$Properties): Uint8Array {
  return dataFrame(pb.DataType.DATA_CLEANING_STATUS, pb.CleaningStatus.encode(status).finish());
}

export function cleaningPlanFrame(plan: vacuum.v1.CleaningPlan.$Properties): Uint8Array {
  return dataFrame(pb.DataType.DATA_CLEANING_PLAN, pb.CleaningPlan.encode(plan).finish());
}

/** A cleaned area of 2 x 2 cells, cells given as run-length pairs. */
export function cleanedAreaFrame(jobId: number, cellsRle: number[] = [0, 100, 2, 0]): Uint8Array {
  return dataFrame(
    pb.DataType.DATA_CLEANED_AREA,
    pb.CleanedArea.encode({ jobId, width: 2, height: 2, resolution: 0.05, originX: 0, originY: 0, cellsRle: new Uint8Array(cellsRle) }).finish(),
  );
}

export interface SentCommand {
  channel: number;
  type: number;
  requestId: number;
  mode?: string;
  goTo?: { x: number; y: number; heading: number };
  cancelGoalId?: Uint8Array;
  drive?: { forward: number; turn: number };
  saveMap?: { name: string; replace: boolean };
  job?: vacuum.v1.CleaningJob; // StartCleaning, PreviewCleaning, SaveCleaningPlan
  resume?: boolean; // PauseCleaning
  name?: string; // SaveCleaningPlan, DeleteCleaningPlan
  replace?: boolean; // SaveCleaningPlan
  maxRecords?: number; // ListCleaningHistory
  recordId?: string; // GetCleaningRecord
  zones?: { mapName: string; zones: { name: string; pointsCm: number[] }[] }; // SetNoGoZones
}

/** The commands a socket has sent, decoded far enough to check them. */
export function sentCommands(socket: TestSocket): SentCommand[] {
  return socket.sent.map((bytes) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const type = view.getUint8(1);
    const payload = bytes.subarray(6);
    const out: SentCommand = { channel: view.getUint8(0), type, requestId: pb.RequestId.decode(payload).requestId };
    if (type === pb.CommandType.COMMAND_CHANGE_MODE) out.mode = pb.ChangeMode.decode(payload).mode;
    if (type === pb.CommandType.COMMAND_GO_TO) {
      const m = pb.GoTo.decode(payload);
      out.goTo = { x: m.x, y: m.y, heading: m.heading };
    }
    if (type === pb.CommandType.COMMAND_CANCEL_GOAL) out.cancelGoalId = Uint8Array.from(pb.CancelGoal.decode(payload).goalId);
    if (type === pb.CommandType.COMMAND_SAVE_MAP) {
      const m = pb.SaveMap.decode(payload);
      out.saveMap = { name: m.name, replace: m.replace };
    }
    if (type === pb.CommandType.COMMAND_DRIVE) {
      const m = pb.Drive.decode(payload);
      out.drive = { forward: m.forward, turn: m.turn };
    }
    if (type === pb.CommandType.COMMAND_START_CLEANING) out.job = pb.CleaningJob.create(pb.StartCleaning.decode(payload).job ?? {});
    if (type === pb.CommandType.COMMAND_PREVIEW_CLEANING) out.job = pb.CleaningJob.create(pb.PreviewCleaning.decode(payload).job ?? {});
    if (type === pb.CommandType.COMMAND_PAUSE_CLEANING) out.resume = pb.PauseCleaning.decode(payload).resume;
    if (type === pb.CommandType.COMMAND_SAVE_CLEANING_PLAN) {
      const m = pb.SaveCleaningPlan.decode(payload);
      out.job = pb.CleaningJob.create(m.job ?? {});
      out.name = m.name;
      out.replace = m.replace;
    }
    if (type === pb.CommandType.COMMAND_DELETE_CLEANING_PLAN) out.name = pb.DeleteCleaningPlan.decode(payload).name;
    if (type === pb.CommandType.COMMAND_LIST_CLEANING_HISTORY) out.maxRecords = pb.ListCleaningHistory.decode(payload).maxRecords;
    if (type === pb.CommandType.COMMAND_GET_CLEANING_RECORD) out.recordId = pb.GetCleaningRecord.decode(payload).id;
    if (type === pb.CommandType.COMMAND_SET_NO_GO_ZONES) {
      const m = pb.SetNoGoZones.decode(payload);
      out.zones = { mapName: m.mapName, zones: m.zones.map((z) => ({ name: z.name ?? '', pointsCm: Array.from(z.pointsCm ?? []) })) };
    }
    return out;
  });
}

export function navigationFrame(goalId: Uint8Array, state: number, distanceRemaining = 0): Uint8Array {
  return dataFrame(pb.DataType.DATA_NAVIGATION, pb.NavigationStatus.encode({ goalId, state, distanceRemaining }).finish());
}

export const NavState = pb.NavigationStatus.State;

export function zonesFrame(zones: { name: string; pointsCm: number[] }[], mapName = 'house'): Uint8Array {
  return dataFrame(pb.DataType.DATA_NO_GO_ZONES, pb.NoGoZones.encode({ zones, mapName }).finish());
}

/** A map of free cells, with an optional set of cells (index -> value) changed. */
export function freeMapFrame(
  width: number,
  height: number,
  resolution: number,
  originX: number,
  originY: number,
  changed: Record<number, number> = {},
): Uint8Array {
  const cells = new Int8Array(width * height);
  for (const [i, v] of Object.entries(changed)) cells[Number(i)] = v;
  const rle: number[] = [];
  for (let i = 0; i < cells.length; ) {
    let run = 1;
    while (i + run < cells.length && run < 256 && cells[i + run] === cells[i]) run++;
    rle.push(run - 1, cells[i] & 0xff);
    i += run;
  }
  return dataFrame(
    pb.DataType.DATA_MAP,
    pb.Map.encode({ version: 1, width, height, resolution, originX, originY, cellsRle: new Uint8Array(rle) }).finish(),
  );
}
