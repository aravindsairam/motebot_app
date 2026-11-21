// What to show about the newest navigation goal. Plain data in and out, tested without a screen.
// Shown only while the robot is in navigation or exploring mode (where the explorer's goals are
// the trips): in other modes Nav2 is off, and an old "on the way" must not look current.

import type { NavigationStatus } from '../transport/messages';
import type { Received } from './store';

export const NAVIGATION_STALE_AFTER_MS = 5000; // the gateway repeats the status every 2 s
const TRIP_MODES = ['navigation', 'exploring'];

export interface TripView {
  active: boolean; // a trip is under way: show the route and the goal
  text: string | null; // for the status strip
}

export function tripView(nav: Received<NavigationStatus> | null, mode: string, now: number): TripView {
  if (!TRIP_MODES.includes(mode) || nav === null || now - nav.at > NAVIGATION_STALE_AFTER_MS) {
    return { active: false, text: null };
  }
  const { state, distanceRemaining } = nav.value;
  switch (state) {
    case 'accepted':
      return { active: true, text: 'Starting the trip…' };
    case 'on_the_way':
      return { active: true, text: distanceRemaining > 0 ? `On the way · ${distanceRemaining.toFixed(1)} m left` : 'On the way' };
    case 'cancelling':
      return { active: true, text: 'Cancelling the trip…' };
    case 'reached':
      return { active: false, text: 'Arrived' };
    case 'failed':
      return { active: false, text: "Couldn't finish the trip" };
    case 'cancelled':
      return { active: false, text: 'Trip cancelled' };
    default:
      return { active: false, text: null };
  }
}
