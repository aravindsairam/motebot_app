// The trip the app is setting up or has sent: whether the user is picking a point on the map,
// the pin placed so far (and why the robot cannot go there, if it cannot), and the goal the robot
// accepted. No other imports, so the client can clear it on disconnect without an import cycle.

import { create } from 'zustand';

export interface Point {
  x: number; // metres, map coordinates
  y: number;
}

export interface TripState {
  picking: boolean; // the next tap on the map places the pin
  pin: (Point & { problem: string | null }) | null; // where the user has tapped, not sent yet
  goal: (Point & { id: Uint8Array }) | null; // the goal this app sent, until it ends or is forgotten
}

export const useTrip = create<TripState>(() => ({ picking: false, pin: null, goal: null }));

export function resetTrip(): void {
  useTrip.setState({ picking: false, pin: null, goal: null });
}

/** Stop following the trip this app sent (the user stopped the robot or sent it elsewhere):
 *  how it ends is then no news. */
export function forgetGoal(): void {
  useTrip.setState({ goal: null });
}
