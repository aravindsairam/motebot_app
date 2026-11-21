// Driving by hand: the joystick's position becomes speeds, sent 20 times a second while it is
// held and once with zeros when it is let go. The robot stops by itself 0.6 s after the last
// command (the safety gate), so a phone that dies, locks or loses Wi-Fi mid-drive stops the robot.
// The safety gate also decides whether the speeds move the robot at all: only in manual and
// mapping modes.

import { showRefusal } from './actionsStore';
import { sendDrive } from './commands';

export const DRIVE_PERIOD_MS = 50;
export const MAX_FORWARD = 0.3; // m/s; the base's limit is 0.306
export const MAX_TURN = 1.2; // rad/s; the base allows 1.9, too twitchy for a thumb
export const DEAD_ZONE = 0.08; // of the stick's travel: a resting thumb does not creep

/**
 * The stick's position to speeds. x to the right and y up, each from -1 to 1; a position outside
 * the circle counts as on its edge. Up drives forward, right turns right.
 */
export function stickToSpeeds(x: number, y: number): { forward: number; turn: number } {
  const r = Math.hypot(x, y);
  if (!Number.isFinite(r) || r <= DEAD_ZONE) return { forward: 0, turn: 0 };
  const k = (Math.min(r, 1) - DEAD_ZONE) / (1 - DEAD_ZONE) / r; // 0 at the dead zone's edge, 1/r at the rim
  return { forward: y * k * MAX_FORWARD, turn: -x * k * MAX_TURN };
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
  const { forward, turn } = stickToSpeeds(stick.x, stick.y);
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
