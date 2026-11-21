// Going to a point, as the user does it: Go to, tap the map (a pin; tap again to move it), then
// Go here. A pin where the robot cannot go (a wall, unexplored space, a no-go zone) is shown red
// with the reason, and cannot be sent. The app asks for navigation mode first if the robot is not
// in it, then sends the goal facing the way the robot will travel. The robot checks that a route
// exists before it moves; the robot decides, the app shows its answer.
//
// A new goal replaces the trip under way. Stop ends it (and navigation mode with it).

import { type Action, showNotice, showRefusal, useActions } from './actionsStore';
import { changeMode, sendGoTo } from './commands';
import { livePose } from './live';
import { whyNotThere } from './spot';
import { useRobot } from './store';
import { forgetGoal, useTrip } from './tripStore';

export function startPicking(): void {
  useTrip.setState({ picking: true, pin: null });
}

export function placePin(x: number, y: number): void {
  if (!useTrip.getState().picking) return;
  const { map, zones } = useRobot.getState();
  const problem = map ? whyNotThere(map.value, zones?.value.zones ?? [], x, y) : 'There is no map yet';
  useTrip.setState({ pin: { x, y, problem } });
}

export function stopPicking(): void {
  useTrip.setState({ picking: false, pin: null });
}

/** The way to face on arrival: the direction of travel, so the robot does not turn at the end. */
export function arrivalHeading(fromX: number, fromY: number, fromHeading: number, toX: number, toY: number): number {
  return Math.hypot(toX - fromX, toY - fromY) < 0.1 ? fromHeading : Math.atan2(toY - fromY, toX - fromX);
}

function done(action: Action): void {
  useActions.setState((s) => ({ busy: s.busy === action ? null : s.busy }));
}

export async function goToPin(): Promise<void> {
  const pin = useTrip.getState().pin;
  if (pin === null || pin.problem !== null) return;
  forgetGoal(); // a trip under way is replaced: how it ends is no news
  useActions.setState({ busy: 'goto' });
  showNotice(null);
  if (useRobot.getState().robotState?.value.state !== 'navigation') {
    const switched = await changeMode('navigation');
    if (!switched.ok) {
      done('goto');
      showRefusal("Couldn't start navigation", switched.text);
      return;
    }
  }
  const pose = livePose.value;
  const heading = pose ? arrivalHeading(pose.x, pose.y, pose.heading, pin.x, pin.y) : 0;
  const sent = await sendGoTo(pin.x, pin.y, heading);
  done('goto');
  if (!sent.ok || sent.goalId === null) {
    showRefusal("Can't go there", sent.text); // the pin stays, to move it and try again
    return;
  }
  useTrip.setState({ picking: false, pin: null, goal: { id: sent.goalId, x: pin.x, y: pin.y } });
}
