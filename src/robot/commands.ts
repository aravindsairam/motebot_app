// What the app can ask of the robot. Each command is a request to one of the robot's own
// interfaces (through the gateway); the robot decides.

import { RequestError } from '../transport/connection';
import {
  type CleaningEstimate,
  type CleaningHistory,
  type CleaningJob,
  type CleaningPlanInfo,
  type CleaningRecord,
  CommandType,
  encodeChangeMode,
  encodeDeleteCleaningPlan,
  encodeDrive,
  encodeGetCleaningRecord,
  encodeGoTo,
  encodeListCleaningHistory,
  encodeListCleaningPlans,
  encodePauseCleaning,
  encodePreviewCleaning,
  encodeSaveCleaningPlan,
  encodeSaveMap,
  encodeSetNoGoZones,
  encodeStartCleaning,
  encodeStartExploration,
  type Reply,
} from '../transport/messages';
import { currentConnection } from './client';

// Longer than the gateway's own limit for a mode change (240 s), so that normally the gateway's
// "timed out" answer, which says more, arrives first.
const CHANGE_MODE_TIMEOUT_MS = 250_000;
const GO_TO_TIMEOUT_MS = 17_000; // the gateway's limit is 12 s: a route check, then Nav2 accepts or refuses
const DRIVE_TIMEOUT_MS = 3000; // answered at once; the next one follows 50 ms later anyway
const SAVE_MAP_TIMEOUT_MS = 65_000; // the gateway's limit is 60 s
const SET_ZONES_TIMEOUT_MS = 20_000; // the robot saves them, makes Nav2's mask and has Nav2 load it
// The robot answers a Start once it has planned the job, in about a second; the gateway's limit
// for it is still the one it had when the answer came after the mode change (260 s).
const START_CLEANING_TIMEOUT_MS = 270_000;
const CLEANING_CALL_TIMEOUT_MS = 25_000; // the gateway's limit is 20 s for every other cleaning request
const START_EXPLORATION_TIMEOUT_MS = 15_000; // answered at once, before the robot changes mode; the gateway's limit is 10 s

export interface Outcome {
  ok: boolean;
  text: string; // the robot's own words where it gave any
}

export function outcomeOf(reply: Reply): Outcome {
  switch (reply.result) {
    case 'ok':
      return { ok: true, text: reply.message };
    case 'bad_request':
      return { ok: false, text: `the robot's software did not understand the request (${reply.message}); is it a different version?` };
    case 'unknown':
      return { ok: false, text: `the robot answered in a way this app does not know: ${reply.message}` };
    default:
      return { ok: false, text: reply.message };
  }
}

/** Ask the robot for a mode. Resolves when the change has finished or failed; never rejects. */
export async function changeMode(mode: string): Promise<Outcome> {
  const connection = currentConnection();
  if (connection === null) return { ok: false, text: 'not connected to the robot' };
  try {
    const reply = await connection.request(
      CommandType.COMMAND_CHANGE_MODE,
      (id) => encodeChangeMode(id, mode),
      CHANGE_MODE_TIMEOUT_MS,
    );
    return outcomeOf(reply);
  } catch (error) {
    return { ok: false, text: error instanceof RequestError ? error.message : String(error) };
  }
}

async function ask(type: number, encode: (id: number) => Uint8Array, timeoutMs: number): Promise<{ reply: Reply | null; outcome: Outcome }> {
  const connection = currentConnection();
  if (connection === null) return { reply: null, outcome: { ok: false, text: 'not connected to the robot' } };
  try {
    const reply = await connection.request(type, encode, timeoutMs);
    return { reply, outcome: outcomeOf(reply) };
  } catch (error) {
    return { reply: null, outcome: { ok: false, text: error instanceof RequestError ? error.message : String(error) } };
  }
}

/** Send the robot to (x, y), map coordinates. The robot must already be in navigation mode. */
export async function sendGoTo(x: number, y: number, heading: number): Promise<Outcome & { goalId: Uint8Array | null }> {
  const { reply, outcome } = await ask(CommandType.COMMAND_GO_TO, (id) => encodeGoTo(id, x, y, heading), GO_TO_TIMEOUT_MS);
  return { ...outcome, goalId: outcome.ok && reply && reply.goalId.length === 16 ? reply.goalId : null };
}

/** The joystick's speeds. Answered at once; refused when another phone is driving. */
export async function sendDrive(forward: number, turn: number): Promise<Outcome> {
  return (await ask(CommandType.COMMAND_DRIVE, (id) => encodeDrive(id, forward, turn), DRIVE_TIMEOUT_MS)).outcome;
}

/** Save the map being made. `nameTaken`: a map of that name exists and `replace` was false. */
export async function sendSaveMap(name: string, replace: boolean): Promise<Outcome & { nameTaken: boolean }> {
  const { reply, outcome } = await ask(CommandType.COMMAND_SAVE_MAP, (id) => encodeSaveMap(id, name, replace), SAVE_MAP_TIMEOUT_MS);
  return { ...outcome, nameTaken: reply?.result === 'already_exists' };
}

/** Replace the no-go zones of map `mapName` (the one in use) with `zones`. Answered once they are
 *  saved and in force, or with the robot's reason for refusing. */
export async function sendSetNoGoZones(mapName: string, zones: readonly { name: string; points: ArrayLike<number> }[]): Promise<Outcome> {
  return (await ask(CommandType.COMMAND_SET_NO_GO_ZONES, (id) => encodeSetNoGoZones(id, mapName, zones), SET_ZONES_TIMEOUT_MS)).outcome;
}

/** Start a clean. Answered once the robot has checked and planned the job (about a second), with
 *  the job's number and estimate, or with the robot's reason for not cleaning. The robot then
 *  switches to cleaning mode by itself; if that fails, the job ends as failed in the status. */
export async function startCleaning(job: CleaningJob): Promise<Outcome & { jobId: number; estimate: CleaningEstimate | null }> {
  const { reply, outcome } = await ask(CommandType.COMMAND_START_CLEANING, (id) => encodeStartCleaning(id, job), START_CLEANING_TIMEOUT_MS);
  return { ...outcome, jobId: outcome.ok ? (reply?.jobId ?? 0) : 0, estimate: outcome.ok ? (reply?.estimate ?? null) : null };
}

/** Start an exploration: the robot maps the house by itself. Answered at once, before the robot
 *  changes mode, with the exploration's number or the robot's reason for not exploring. If a mode
 *  change then fails, it ends as failed in the exploration status. `timeLimit`: s, 0 = the robot's. */
export async function startExploration(timeLimit = 0): Promise<Outcome & { jobId: number }> {
  const { reply, outcome } = await ask(
    CommandType.COMMAND_START_EXPLORATION,
    (id) => encodeStartExploration(id, timeLimit),
    START_EXPLORATION_TIMEOUT_MS,
  );
  return { ...outcome, jobId: outcome.ok ? (reply?.jobId ?? 0) : 0 };
}

/** Pause the clean (the robot stands still, still in cleaning mode), or resume it. */
export async function pauseCleaning(resume: boolean): Promise<Outcome> {
  return (await ask(CommandType.COMMAND_PAUSE_CLEANING, (id) => encodePauseCleaning(id, resume), CLEANING_CALL_TIMEOUT_MS)).outcome;
}

/** Plan without moving. The rows arrive as the cleaning plan stream (job number 0). `replanned`:
 *  a saved plan whose map has changed, so its rows were planned again. */
export async function previewCleaning(job: CleaningJob): Promise<Outcome & { estimate: CleaningEstimate | null; replanned: boolean }> {
  const { reply, outcome } = await ask(CommandType.COMMAND_PREVIEW_CLEANING, (id) => encodePreviewCleaning(id, job), CLEANING_CALL_TIMEOUT_MS);
  return { ...outcome, estimate: outcome.ok ? (reply?.estimate ?? null) : null, replanned: reply?.replanned === true };
}

/** Save a cleaning job under a name. `nameTaken`: a plan of that name exists and `replace` was false. */
export async function saveCleaningPlan(
  name: string,
  job: CleaningJob,
  replace: boolean,
): Promise<Outcome & { nameTaken: boolean; estimate: CleaningEstimate | null }> {
  const { reply, outcome } = await ask(
    CommandType.COMMAND_SAVE_CLEANING_PLAN,
    (id) => encodeSaveCleaningPlan(id, name, job, replace),
    CLEANING_CALL_TIMEOUT_MS,
  );
  return { ...outcome, nameTaken: reply?.result === 'already_exists', estimate: outcome.ok ? (reply?.estimate ?? null) : null };
}

export async function listCleaningPlans(): Promise<Outcome & { plans: CleaningPlanInfo[] }> {
  const { reply, outcome } = await ask(CommandType.COMMAND_LIST_CLEANING_PLANS, encodeListCleaningPlans, CLEANING_CALL_TIMEOUT_MS);
  return { ...outcome, plans: outcome.ok && reply ? reply.plans : [] };
}

export async function deleteCleaningPlan(name: string): Promise<Outcome> {
  return (await ask(CommandType.COMMAND_DELETE_CLEANING_PLAN, (id) => encodeDeleteCleaningPlan(id, name), CLEANING_CALL_TIMEOUT_MS)).outcome;
}

/** The past cleans, newest first, without their pictures, and the totals. maxRecords 0: all kept. */
export async function listCleaningHistory(maxRecords = 0): Promise<Outcome & { history: CleaningHistory | null }> {
  const { reply, outcome } = await ask(
    CommandType.COMMAND_LIST_CLEANING_HISTORY,
    (id) => encodeListCleaningHistory(id, maxRecords),
    CLEANING_CALL_TIMEOUT_MS,
  );
  return { ...outcome, history: outcome.ok ? (reply?.history ?? null) : null };
}

/** One past clean, with its picture. */
export async function getCleaningRecord(recordId: string): Promise<Outcome & { record: CleaningRecord | null }> {
  const { reply, outcome } = await ask(CommandType.COMMAND_GET_CLEANING_RECORD, (id) => encodeGetCleaningRecord(id, recordId), CLEANING_CALL_TIMEOUT_MS);
  return { ...outcome, record: outcome.ok ? (reply?.record ?? null) : null };
}
