// Driving by hand: the joystick's position becomes speeds, sent 20 times a second while it is
// held and once with zeros when it is let go. The robot stops by itself 0.6 s after the last
// command (the safety gate), so a phone that dies, locks or loses Wi-Fi mid-drive stops the robot.
// The safety gate also decides whether the speeds move the robot at all: only in manual and
// mapping modes.
//
// How fast the stick drives at full push is one of the robot's settings (the joystick speed, and
// the turn speed that follows it). The robot holds the commands to those values itself; the app
// scales the stick to them, so the whole of its travel is used.

import { showRefusal } from './actionsStore';
import { sendDrive } from './commands';
import { useRobot } from './store';

export const DRIVE_PERIOD_MS = 50;
// The stick's top speeds until the robot has sent its settings.
export const MAX_FORWARD = 0.3; // m/s; the base's limit is 0.306
export const MAX_TURN = 1.2; // rad/s; the base allows 1.9, too twitchy for a thumb
export const DEAD_ZONE = 0.08; // of the stick's travel: a resting thumb does not creep

export interface TopSpeeds {
  forward: number; // m/s with the stick pushed all the way up
  turn: number; // rad/s with the stick pushed all the way to one side
}

/** The stick's top speeds: the robot's settings where it has sent them, else the app's own. */
export function topSpeeds(settings: { manualSpeed: number; manualTurnSpeed: number } | null | undefined): TopSpeeds {
  const known = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
  return {
    forward: known(settings?.manualSpeed) ? settings.manualSpeed : MAX_FORWARD,
    turn: known(settings?.manualTurnSpeed) ? settings.manualTurnSpeed : MAX_TURN,
  };
}

/**
 * The stick's position to speeds. x to the right and y up, each from -1 to 1; a position outside
 * the circle counts as on its edge. Up drives forward, right turns right. `top`: the speeds at
 * full push.
 */
export function stickToSpeeds(x: number, y: number, top: TopSpeeds = { forward: MAX_FORWARD, turn: MAX_TURN }): { forward: number; turn: number } {
  const r = Math.hypot(x, y);
  if (!Number.isFinite(r) || r <= DEAD_ZONE) return { forward: 0, turn: 0 };
  const k = (Math.min(r, 1) - DEAD_ZONE) / (1 - DEAD_ZONE) / r; // 0 at the dead zone's edge, 1/r at the rim
  return { forward: y * k * top.forward, turn: -x * k * top.turn };
}

let stick: { x: number; y: number } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let refusalShown = false;

async function send(forward: number, turn: number): Promise<void> {
  const outcome = await sendDrive(forward, turn);
  if (!outcome.ok && !refusalShown) {
    refusalShown = true; // once per touch, not 20 times a second
    showRefusal("Can't drive", outcome.text);
  }
}

function tick(): void {
  if (stick === null) return;
  const { forward, turn } = stickToSpeeds(stick.x, stick.y, topSpeeds(useRobot.getState().settings?.value));
  void send(forward, turn);
}

/** The thumb is on the stick at (x, y). Starts sending if not already. */
export function holdStick(x: number, y: number): void {
  stick = { x, y };
  if (timer === null) {
    refusalShown = false;
    tick();
    timer = setInterval(tick, DRIVE_PERIOD_MS);
  }
}

/** The thumb has left the stick (or the app is going away): one zero, then silence. */
export function releaseStick(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
  stick = null;
  void send(0, 0);
}

export function isDriving(): boolean {
  return timer !== null;
}
