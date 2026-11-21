// Exploring in words: the status line while it runs ("4 places left · 18 m² · 2:10") and the card
// at the end. Plain data in, text out.

import type { ExplorationState, ExplorationStatus } from '../transport/messages';
import { type Notice, sentence } from './actionsStore';
import { areaText, clockText, durationText } from './cleaningText';

export const RUNNING_EXPLORATION: ExplorationState[] = ['starting', 'exploring', 'returning', 'ending'];
export const ENDED_EXPLORATION: ExplorationState[] = ['finished', 'stopped', 'failed'];

const NO_GO_REMINDER = 'Save the map. A new map has no no-go zones: mark stairs and drops with the Zones button once it is saved.';

/** The one line for the status strip while an exploration runs. */
export function explorationLine(s: ExplorationStatus): string {
  const area = areaText(s.mappedArea);
  switch (s.state) {
    case 'starting':
      return 'Getting ready to explore…';
    case 'exploring': {
      const lead = s.message && s.message !== 'exploring' ? sentence(s.message).replace(/\.$/, '') : `${s.placesLeft} ${s.placesLeft === 1 ? 'place' : 'places'} left`;
      return `${lead} · ${area} · ${clockText(s.exploringTime)}`;
    }
    case 'returning':
      return `Going back to where it started · ${area}`;
    case 'ending':
      return 'Finishing…';
    default:
      return '';
  }
}

/** The card when an exploration ends; null while it runs. */
export function explorationReport(s: ExplorationStatus): Notice | null {
  switch (s.state) {
    case 'finished': {
      const early = s.message.includes('time limit');
      const unreachable = s.message.includes('could not be reached');
      const notBack = s.message.includes('could not get back');
      const notes = [
        early ? 'Finished early: the time limit was reached.' : '',
        unreachable ? 'Some places could not be reached.' : '',
        notBack ? 'It could not get back to where it started.' : '',
      ].filter(Boolean);
      return {
        tone: 'success',
        title: `Explored ${areaText(s.mappedArea)} in ${durationText(s.exploringTime)}`,
        text: [...notes, NO_GO_REMINDER].join(' '),
        keep: true,
      };
    }
    case 'stopped':
      return { tone: 'info', title: 'Exploring stopped', text: 'The map so far is kept: save it, explore again, or drive on by hand.' };
    case 'failed':
      return { tone: 'error', title: "Exploring didn't finish", text: `${sentence(s.message)} The map so far is kept when the robot is in mapping.` };
    default:
      return null;
  }
}
