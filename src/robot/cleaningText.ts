// Cleaning in words and numbers, as the screens show it: the live numbers ("43 %", "9.1 m²",
// "38 m", "6:10"), where the robot is ("Row 12 of 31 · 6 min left"), the estimate before a clean,
// the report card at the end, and the lines of the History tab. Plain data in, text out.

import type { CleaningEstimate, CleaningJob, CleaningRecord, CleaningState, CleaningStatus, CleaningTotals } from '../transport/messages';
import { type Notice, sentence } from './actionsStore';

/** "43 %" */
export function percentText(percent: number): string {
  return `${Math.round(Math.max(0, percent))} %`;
}

/** "9.1 m²" below 10 m², "21 m²" from there. */
export function areaText(m2: number): string {
  const a = Math.max(0, m2);
  return a < 9.95 ? `${a.toFixed(1)} m²` : `${Math.round(a)} m²`;
}

/** "4.5 m" below 10 m, "38 m" from there, "1.5 km" from 1000 m. */
export function distanceText(m: number): string {
  const d = Math.max(0, m);
  if (d >= 999.5) return `${(d / 1000).toFixed(1)} km`;
  return d < 9.95 ? `${d.toFixed(1)} m` : `${Math.round(d)} m`;
}

/** A stopwatch: "6:10", "1:02:05". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "14 min", "1 h 5 min", "5 h", "under 1 min". Rounded to the minute. */
export function durationText(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "6 min left", "under a minute left"; empty when the robot gave no estimate. */
export function timeLeftText(seconds: number): string {
  if (!(seconds > 0)) return '';
  if (seconds < 60) return 'under a minute left';
  return `${durationText(seconds)} left`;
}

/** The four big numbers while cleaning. */
export function liveNumbers(status: CleaningStatus): { coverage: string; area: string; distance: string; time: string } {
  return {
    coverage: percentText(status.coverage),
    area: areaText(status.cleanedArea),
    distance: distanceText(status.distance),
    time: clockText(status.cleaningTime),
  };
}

/** "Row 12 of 31", or "Edge 3 of 12" once the rows are done; empty when neither is left. */
export function whereText(status: CleaningStatus): string {
  if (status.currentRow > 0) return `Row ${status.currentRow} of ${status.rowsTotal}`;
  if (status.currentEdge > 0) return `Edge ${status.currentEdge} of ${status.edgesTotal}`;
  return '';
}

/** A clean is under way: from the robot accepting it to the hand-over to the next mode. */
export const RUNNING_STATES: readonly CleaningState[] = ['starting', 'cleaning', 'paused', 'ending'];
export const ENDED_STATES: readonly CleaningState[] = ['finished', 'stopped', 'failed'];

/** One line about the clean under way: "Row 12 of 31 · 6 min left". */
export function progressText(status: CleaningStatus): string {
  switch (status.state) {
    case 'starting':
      return 'Getting ready to clean…';
    case 'cleaning':
      return [whereText(status), timeLeftText(status.timeLeft)].filter((t) => t).join(' · ') || 'Cleaning';
    case 'paused':
      return whereText(status) ? `Paused at ${whereText(status).toLowerCase()}` : 'Paused';
    case 'ending':
      return 'Finishing up…';
    case 'finished':
      return 'Cleaning finished';
    case 'stopped':
      return 'Cleaning stopped';
    case 'failed':
      return "Cleaning didn't finish";
    default:
      return '';
  }
}

/** Before a clean: "31 rows · about 14 min · 21 m²". */
export function estimateText(e: CleaningEstimate): string {
  const rows = `${e.rows} ${e.rows === 1 ? 'row' : 'rows'}`;
  const edges = e.edges > 0 ? `, ${e.edges} ${e.edges === 1 ? 'edge' : 'edges'}` : '';
  return `${rows}${edges} · about ${durationText(e.time)} · ${areaText(e.plannedArea)}`;
}

/** What was cleaned, in a word: the robot's target ("everything", "area", "spot") or a plan's name. */
export function targetLabel(target: string): string {
  switch (target) {
    case 'everything':
    case '':
      return 'Everything';
    case 'area':
      return 'An area';
    case 'spot':
      return 'A spot';
    default:
      return target; // a saved plan's name, as the user wrote it
  }
}

/** "in 14 minutes", "in under a minute", "in 1 h 5 min" */
function inTime(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  if (minutes < 1) return 'in under a minute';
  if (minutes === 1) return 'in 1 minute';
  if (minutes < 60) return `in ${minutes} minutes`;
  return `in ${durationText(seconds)}`;
}

/** "Cleaned 21 m² (96%) in 14 minutes." */
export function cleanedSentence(status: CleaningStatus): string {
  if (!(status.cleanedArea > 0)) return 'Nothing was cleaned.';
  return `Cleaned ${areaText(status.cleanedArea)} (${Math.round(Math.max(0, status.coverage))}%) ${inTime(status.cleaningTime)}.`;
}

/** The robot's reason after "stopped: " or "failed: ". */
function reasonOf(status: CleaningStatus): string {
  return status.message.replace(/^(stopped|failed)\s*:\s*/i, '').trim();
}

function skippedSentence(status: CleaningStatus): string {
  const n = status.rowsSkipped + status.edgesSkipped;
  if (n === 0) return '';
  return n === 1 ? ' 1 row was skipped: something was in the way.' : ` ${n} rows were skipped: something was in the way.`;
}

/** The card at the end of a clean. It stays until dismissed. */
export function cleaningReport(status: CleaningStatus): Notice | null {
  switch (status.state) {
    case 'finished':
      return { tone: 'success', title: 'Cleaning finished', text: cleanedSentence(status) + skippedSentence(status), keep: true };
    case 'stopped': {
      const why = sentence(reasonOf(status));
      return { tone: 'info', title: 'Cleaning stopped', text: [cleanedSentence(status), why].filter((t) => t).join(' '), keep: true };
    }
    case 'failed': {
      const why = sentence(reasonOf(status)) || 'The robot gave no reason.';
      const done = status.cleanedArea > 0 ? ` ${cleanedSentence(status)}` : '';
      return { tone: 'error', title: "Cleaning didn't finish", text: why + done + skippedSentence(status), keep: true };
    }
    default:
      return null;
  }
}

/** The History tab's top line: "23 cleans · 412 m² · 5 h 10 min · 1.5 km". */
export function totalsText(t: CleaningTotals): string {
  if (t.cleans === 0) return 'No cleans yet';
  return `${t.cleans} ${t.cleans === 1 ? 'clean' : 'cleans'} · ${areaText(t.area)} · ${durationText(t.time)} · ${distanceText(t.distance)}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When a clean started, in the phone's time: "Today 10:42", "Yesterday 18:03", "Mon 16 Nov 09:15". */
export function whenText(secondsSince1970: number, nowMs: number): string {
  const d = new Date(secondsSince1970 * 1000);
  const now = new Date(nowMs);
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (days === 0) return `Today ${clock}`;
  if (days === 1) return `Yesterday ${clock}`;
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year} ${clock}`;
}

/** How a clean ended, in a word. */
export function endedLabel(state: CleaningState): string {
  switch (state) {
    case 'finished':
      return 'done';
    case 'stopped':
      return 'stopped';
    case 'failed':
      return 'failed';
    default:
      return state;
  }
}

/** One past clean on the History tab. */
export function historyLine(record: CleaningRecord, nowMs: number): { when: string; what: string; numbers: string; ended: string } {
  const s = record.status;
  return {
    when: whenText(record.started, nowMs),
    what: targetLabel(s.target),
    numbers: `${areaText(s.cleanedArea)} · ${percentText(s.coverage)} · ${durationText(s.cleaningTime)}`,
    ended: endedLabel(s.state),
  };
}

/** "Twice · with the edges · then back to the dock", from a job as it was sent. */
export function jobOptionsText(job: CleaningJob): string {
  const parts = [job.passes === 2 ? 'Twice' : 'Once'];
  if (job.edges !== 'default') parts.push(job.edges === 'on' ? 'with the edges' : 'no edges');
  parts.push(job.returnToDock === 'off' ? 'then stays where it ends' : 'then back to the dock');
  return parts.join(' · ');
}

/** The numbers of one past clean, as label and value, for its page on the History tab. */
export function recordRows(status: CleaningStatus): { label: string; value: string }[] {
  const reason = reasonOf(status);
  const how =
    status.state === 'finished'
      ? 'Finished'
      : status.state === 'stopped'
        ? `Stopped${reason ? `: ${reason}` : ''}`
        : status.state === 'failed'
          ? `Didn't finish${reason ? `: ${reason}` : ''}`
          : status.state;
  const rows: { label: string; value: string }[] = [
    { label: 'How it ended', value: how },
    { label: 'Cleaned', value: `${areaText(status.cleanedArea)} of ${areaText(status.plannedArea)} (${percentText(status.coverage)})` },
    { label: 'Time cleaning', value: durationText(status.cleaningTime) },
    { label: 'Driven', value: distanceText(status.distance) },
    { label: 'Rows', value: `${status.rowsDone} of ${status.rowsTotal}${status.rowsSkipped ? `, ${status.rowsSkipped} skipped` : ''}` },
  ];
  if (status.edgesTotal > 0) {
    rows.push({ label: 'Edges', value: `${status.edgesDone} of ${status.edgesTotal}${status.edgesSkipped ? `, ${status.edgesSkipped} skipped` : ''}` });
  }
  if (status.bumps > 0) rows.push({ label: 'Bumps', value: String(status.bumps) });
  if (status.pauses > 0) rows.push({ label: 'Pauses', value: String(status.pauses) });
  rows.push({ label: 'Options', value: jobOptionsText(status.job) });
  return rows;
}
