// Cleaning from the phone. Clean opens the choosing panel: Everything, an Area (dragged on the
// map), a Spot (tapped), a Room (by name) or a saved Plan, with the options. Each change of
// choice asks the robot for a preview, so its rows and estimate are on the screen before anything
// moves. Start sends the job; the robot answers once it has planned it (with the job's number), or
// says why not, and then switches to cleaning mode by itself. Pause and Resume ask the robot; Stop
// and Dock are the usual mode requests and end the clean.
//
// The robot plans, drives and records every clean. The app only asks and shows the answers.

import type { CleaningJob } from '../transport/messages';
import { type Action, showNotice, showRefusal, useActions } from './actionsStore';
import { type Box, boxAround, NEW_AREA_SIZE_M, sameBox } from './cleanArea';
import { jobFor, jobKey } from './cleanChoice';
import { type ChoiceKind, type CleanOptions, NO_PREVIEW, type PreviewState, useChoice, useCleaning } from './cleaningStore';
import { deleteCleaningPlan, listCleaningPlans, pauseCleaning, previewCleaning, saveCleaningPlan, startCleaning } from './commands';


let previewTimer: ReturnType<typeof setTimeout> | null = null;
let previewSeq = 0; // the newest preview request; answers to older ones are dropped
let startSeq = 0; // the newest Start; Stop or Dock while it waits makes its answer no news

function setPreview(preview: PreviewState): void {
  useChoice.setState({ preview });
}

/** Ask the robot for a preview of the current choice, after a short pause for more changes. */
// A dragged area reaches the choice only when the finger lifts, so a change asks at once: the
// timer only folds changes made together (in the same moment) into one request.
export function schedulePreview(delayMs = 0): void {
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = null;
  const choice = useChoice.getState();
  const job = choice.open ? jobFor(choice) : null;
  if (job === null) {
    previewSeq++; // an answer still on its way is for a choice that is gone
    setPreview(NO_PREVIEW);
    return;
  }
  const key = jobKey(job);
  const { state } = choice.preview;
  if (key === choice.preview.key && (state === 'waiting' || state === 'ready')) return; // already asked, or answered
  setPreview({ ...NO_PREVIEW, state: 'waiting', key, sentAt: choice.preview.sentAt });
  previewTimer = setTimeout(() => {
    previewTimer = null;
    void runPreview(job, key);
  }, delayMs);
}

async function runPreview(job: CleaningJob, key: string): Promise<void> {
  const choice = useChoice.getState();
  if (!choice.open || choice.preview.key !== key) return;
  const seq = ++previewSeq;
  const sentAt = Date.now();
  setPreview({ ...choice.preview, sentAt });
  const answer = await previewCleaning(job);
  if (seq !== previewSeq || useChoice.getState().preview.key !== key) return; // the choice has changed since
  setPreview({
    state: answer.ok ? 'ready' : 'refused',
    key,
    estimate: answer.estimate,
    replanned: answer.replanned,
    problem: answer.ok ? null : answer.text,
    sentAt,
    lastReadyAt: answer.ok ? sentAt : choice.preview.lastReadyAt,
  });
}

/** Clean: the choosing panel, with the choice made last time. */
export function openChooser(): void {
  useChoice.setState({ open: true, preview: NO_PREVIEW });
  if (useChoice.getState().kind === 'plan') void loadPlans();
  schedulePreview();
}

export function closeChooser(): void {
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = null;
  previewSeq++;
  useChoice.setState({ open: false, preview: NO_PREVIEW });
}

export function chooseKind(kind: ChoiceKind): void {
  if (useChoice.getState().kind === kind) return;
  useChoice.setState({ kind });
  if (kind === 'plan') void loadPlans();
  schedulePreview();
}

/** The area, in metres on the map; null to start again. */
export function setArea(area: Box | null): void {
  if (sameBox(useChoice.getState().area, area)) return;
  useChoice.setState({ area });
  schedulePreview();
}

/** A tap while marking an area with none yet: a square around the tap, to adjust. */
export function placeArea(x: number, y: number): void {
  if (useChoice.getState().area !== null) return;
  setArea(boxAround(x, y, NEW_AREA_SIZE_M));
}

export function placeSpot(x: number, y: number): void {
  useChoice.setState({ spot: { x, y } });
  schedulePreview();
}

export function choosePlan(name: string): void {
  useChoice.setState({ planName: name });
  schedulePreview();
}

/** A room of the map in use, by name; null when the one chosen is no longer there. */
export function chooseRoom(name: string | null): void {
  if (useChoice.getState().roomName === name) return;
  useChoice.setState({ roomName: name });
  schedulePreview();
}

export function setOption<K extends keyof CleanOptions>(name: K, value: CleanOptions[K]): void {
  useChoice.setState((s) => ({ options: { ...s.options, [name]: value } }));
  schedulePreview();
}

async function busyWith<T>(action: Action, work: () => Promise<T>): Promise<T> {
  useActions.setState({ busy: action });
  showNotice(null);
  try {
    return await work();
  } finally {
    useActions.setState((s) => ({ busy: s.busy === action ? null : s.busy }));
  }
}

/** Start the clean chosen. The panel closes and the cleaning view takes over; if the robot says
 *  no, the panel comes back with the robot's reason, to change the choice and try again. */
export async function startClean(): Promise<void> {
  const job = jobFor(useChoice.getState());
  if (job === null) return;
  const seq = ++startSeq;
  closeChooser();
  const outcome = await busyWith('clean', () => startCleaning(job));
  if (outcome.ok && outcome.jobId !== 0) useCleaning.setState({ mine: outcome.jobId }); // its end gets a report
  if (seq !== startSeq) return; // stopped or sent to the dock meanwhile: how the start ended is no news
  if (!outcome.ok) {
    showRefusal("Couldn't start cleaning", outcome.text);
    useChoice.setState({ open: true });
    schedulePreview();
  }
}

/** Stop or Dock was pressed: a Start still waiting for its answer is no longer news. */
export function forgetCleanStart(): void {
  startSeq++;
}

export async function pauseClean(resume: boolean): Promise<void> {
  const outcome = await busyWith(resume ? 'resume' : 'pause', () => pauseCleaning(resume));
  if (!outcome.ok) showRefusal(resume ? "Couldn't resume" : "Couldn't pause", outcome.text);
}

export type SaveResult = 'saved' | 'name_taken' | 'failed';

/** Save the choice as a plan. 'name_taken': a plan of that name exists and `replace` was false:
 *  ask the user, then call again with `replace`. */
export async function savePlan(name: string, replace: boolean): Promise<SaveResult> {
  const choice = useChoice.getState();
  const job = choice.kind === 'plan' ? null : jobFor(choice);
  if (job === null) return 'failed';
  const trimmed = name.trim();
  return busyWith('save_plan', async () => {
    const saved = await saveCleaningPlan(trimmed, job, replace);
    if (saved.nameTaken) return 'name_taken';
    if (!saved.ok) {
      showRefusal("Couldn't save the plan", saved.text);
      return 'failed';
    }
    showNotice({ tone: 'success', title: `Plan saved as '${trimmed}'`, text: 'Find it under Plans to clean it again.' });
    if (useChoice.getState().plans.state !== 'none') void loadPlans();
    return 'saved';
  });
}

/** The saved plans, for the Plans list. A chosen plan that is no longer there is unchosen. */
export async function loadPlans(): Promise<void> {
  useChoice.setState((s) => ({ plans: { ...s.plans, state: 'loading', problem: null } }));
  const answer = await listCleaningPlans();
  if (!answer.ok) {
    useChoice.setState((s) => ({ plans: { state: 'failed', list: s.plans.list, problem: answer.text } }));
    return;
  }
  useChoice.setState({ plans: { state: 'ready', list: answer.plans, problem: null } });
  const chosen = useChoice.getState().planName;
  if (chosen !== null && !answer.plans.some((p) => p.name === chosen)) {
    useChoice.setState({ planName: null });
    schedulePreview();
  }
}

export async function deletePlan(name: string): Promise<void> {
  const outcome = await busyWith('delete_plan', () => deleteCleaningPlan(name));
  if (!outcome.ok) showRefusal("Couldn't delete the plan", outcome.text);
  else showNotice({ tone: 'success', title: `Plan '${name}' deleted`, text: '' });
  await loadPlans();
}
