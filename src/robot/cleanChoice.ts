// The clean the user sets up, as the job sent to the robot, and the words that guide the user
// while setting it up. Plain data in, plain data out.

import type { CleaningJob } from '../transport/messages';
import { boxCorners, boxTooSmall } from './cleanArea';
import type { ChoiceState } from './cleaningStore';

export type Choice = Pick<ChoiceState, 'kind' | 'area' | 'spot' | 'planName' | 'roomName' | 'options'>;

/**
 * The job for the choice, or null while it is not complete (no area drawn, no spot, no room, no plan).
 * Options are sent explicitly ('on' or 'off'), never left to the robot's default, so the switches
 * show what the robot is asked for. A saved plan keeps its own area, edges and passes; only
 * "go back to the dock" comes from the switches.
 */
export function jobFor(choice: Choice): CleaningJob | null {
  const { options } = choice;
  const base: CleaningJob = {
    what: 'everything',
    area: [],
    spotX: 0,
    spotY: 0,
    planName: '',
    direction: '',
    passes: options.twice ? 2 : 1,
    edges: options.edges ? 'on' : 'off',
    returnToDock: options.returnToDock ? 'on' : 'off',
    room: '',
  };
  switch (choice.kind) {
    case 'everything':
      return base;
    case 'area':
      return choice.area && !boxTooSmall(choice.area) ? { ...base, what: 'area', area: boxCorners(choice.area) } : null;
    case 'spot':
      return choice.spot ? { ...base, what: 'spot', spotX: choice.spot.x, spotY: choice.spot.y } : null;
    case 'room':
      return choice.roomName ? { ...base, what: 'room', room: choice.roomName } : null;
    case 'plan':
      return choice.planName ? { ...base, what: 'plan', planName: choice.planName } : null;
    default:
      return null;
  }
}

/** Two jobs are the same request when this is the same. */
export function jobKey(job: CleaningJob): string {
  return JSON.stringify(job);
}

/** What to do next, while the choice is not complete; null once it is. */
export function choiceHint(choice: Choice): string | null {
  switch (choice.kind) {
    case 'area':
      if (choice.area === null) return 'Drag across the map to mark the area';
      return boxTooSmall(choice.area) ? 'The area is too small: drag its corners apart' : null;
    case 'spot':
      return choice.spot === null ? 'Tap the middle of the spot to clean' : null;
    case 'room':
      return choice.roomName === null ? 'Pick a room' : null;
    case 'plan':
      return choice.planName === null ? 'Pick a saved plan' : null;
    default:
      return null;
  }
}

/** The line at the top of the map while choosing, once the choice is complete. */
export function mapPrompt(choice: Choice): string | null {
  const hint = choiceHint(choice);
  if (hint !== null) return choice.kind === 'plan' || choice.kind === 'room' ? null : hint; // the list is in the panel
  switch (choice.kind) {
    case 'area':
      return 'Drag a corner to resize, the middle to move';
    case 'spot':
      return 'Tap again to move the spot';
    default:
      return null;
  }
}

/** The names the robot accepts for a plan: 1 to 40 letters, digits, spaces, '-' and '_',
 *  starting with a letter or digit. */
export function planNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Give the plan a name';
  if (n.length > 40) return 'At most 40 characters';
  if (!/^[A-Za-z0-9 _-]+$/.test(n)) return "Only letters, digits, spaces, '-' and '_'";
  if (!/^[A-Za-z0-9]/.test(n)) return 'Start with a letter or a digit';
  return null;
}
