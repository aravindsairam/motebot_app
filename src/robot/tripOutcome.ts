// How a trip this app sent ended, as a message card: "Arrived", or "Couldn't finish the trip".
// Only for the goal this app sent and is still following: a trip someone else sent (RViz, the
// docking server) shows only in the status strip, and one the user replaced or stopped says nothing.

import type { NavigationStatus } from '../transport/messages';
import { sameGoal } from '../transport/messages';
import { type Notice, showNotice } from './actionsStore';
import { useTrip } from './tripStore';

export function noticeFor(status: NavigationStatus): Notice | null {
  switch (status.state) {
    case 'reached':
      return { tone: 'success', title: 'Arrived', text: '' };
    case 'failed':
      return {
        tone: 'error',
        title: "Couldn't finish the trip",
        text: 'Navigation gave up on the way and the robot stopped. Something may be blocking the route.',
      };
    case 'cancelled':
      return { tone: 'info', title: 'Trip cancelled', text: '' };
    default:
      return null;
  }
}

/** Called with every navigation status the robot sends. */
export function onNavigationStatus(status: NavigationStatus): void {
  const goal = useTrip.getState().goal;
  if (goal === null || !sameGoal(goal.id, status.goalId)) return;
  const notice = noticeFor(status);
  if (notice === null) return;
  useTrip.setState({ goal: null }); // the trip is over: one card, not one per repeat
  showNotice(notice);
}
