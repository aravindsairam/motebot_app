// Which buttons are usable right now, and what they say. Decided from the robot's own state:
// a button is enabled when the robot lists the change it asks for among its allowed ones. Plain
// data in, plain data out, so it is tested without a screen.

import type { RobotState } from '../transport/messages';

export interface Controls {
  goTo: { enabled: boolean; hint: string | null };
  drive: { enabled: boolean; label: string; hint: string | null };
  joystick: { shown: boolean; enabled: boolean }; // in manual and mapping, the modes in which the phone drives
  stop: { enabled: boolean; halts: boolean }; // halts: in mapping, Stop stops the motion and mapping goes on
  mapping: boolean; // in mapping mode: the bar shows Explore, Save map and Discard
  exploring: boolean; // in exploring mode: the robot drives itself; the bar shows only Stop
  makingMap: boolean; // a map is being made (mapping, exploring): leaving it loses the map, so ask first
  explore: { enabled: boolean; hint: string | null };
  newMap: { enabled: boolean; hint: string | null };
  dock: { enabled: boolean; label: string; hint: string | null; asksFirst: boolean };
  // target: the mode Reset asks for. Mapping when the robot offers it: the map being made is kept.
  reset: { enabled: boolean; hint: string | null; target: 'idle' | 'mapping' };
}

// Modes in which the robot is not moving and nothing is about to make it move.
const AT_REST = ['idle', 'docked', 'failsafe'];

/**
 * `live`: the robot state is recent. `connected`: the connection is up.
 *
 * Stop asks for idle. It stays usable whenever connected, unless the robot is known to be at
 * rest: if the robot state is old, nobody knows, and asking for idle is harmless.
 *
 * In mapping, Stop does not leave mapping (that would lose the map being made): it lets go of the
 * joystick and sends zero speed. Mapping is left by saving or discarding the map; Dock and other
 * mode changes from mapping ask first. In exploring, Stop asks for idle like everywhere else: the
 * robot carries that out as a change to mapping and keeps the map.
 */
export function controlsFor(state: RobotState | null, live: boolean, connected: boolean): Controls {
  const known = live && state !== null;
  const mode = known ? state.state : '';
  const changing = known && state.transitioning;
  const allowed = known ? state.allowedTransitions : [];
  const mapping = known && !changing && mode === 'mapping';
  const exploring = known && !changing && mode === 'exploring';
  // An older gateway does not send making_map: the mode's name decides then.
  const makingMap = known && (state.makingMap || mode === 'mapping' || mode === 'exploring');

  const stop = {
    enabled: connected && !(known && !changing && AT_REST.includes(mode)),
    halts: mapping,
  };

  let newMap: Controls['newMap'];
  if (!known || changing || makingMap) newMap = { enabled: false, hint: null };
  else if (mode === 'failsafe') newMap = { enabled: false, hint: 'Reset first' };
  else newMap = { enabled: connected && allowed.includes('mapping'), hint: null };

  let dock: Controls['dock'];
  if (mode === 'docking') dock = { enabled: false, label: 'Docking…', hint: null, asksFirst: false };
  else if (mode === 'docked') dock = { enabled: false, label: 'Docked', hint: null, asksFirst: false };
  else {
    const enabled = connected && known && !changing && allowed.includes('docking');
    let hint: string | null = null;
    if (!enabled && known && !changing) {
      if (mode === 'failsafe') hint = 'Reset first';
      else if (!state.currentMap) hint = 'Make a map first';
    }
    dock = { enabled, label: 'Dock', hint, asksFirst: makingMap && !changing };
  }

  const inFailsafe = known && mode === 'failsafe';
  // While a map being made can be gone back to, the robot offers mapping instead of idle.
  const canReset = allowed.includes('idle') || allowed.includes('mapping');
  const reset: Controls['reset'] = {
    enabled: connected && inFailsafe && !changing && canReset,
    hint: inFailsafe && !canReset ? 'Waiting for the faults to clear' : null,
    target: inFailsafe && allowed.includes('mapping') ? 'mapping' : 'idle',
  };

  // Go to needs a map and navigation mode (the app asks for it first). Not from mapping: that
  // would lose the map being made, and the map being made cannot be navigated on yet.
  let goTo: Controls['goTo'];
  if (!known || changing) goTo = { enabled: false, hint: null };
  else if (makingMap) goTo = { enabled: false, hint: 'Not while mapping' };
  else if (mode === 'failsafe') goTo = { enabled: false, hint: 'Reset first' };
  else if (!state.currentMap) goTo = { enabled: false, hint: 'Make a map first' };
  else goTo = { enabled: connected && (mode === 'navigation' || allowed.includes('navigation')), hint: null };

  // Drive asks for manual mode; the joystick appears once the robot is in it.
  let drive: Controls['drive'];
  if (mode === 'manual') drive = { enabled: false, label: 'Driving', hint: null };
  else if (!known || changing) drive = { enabled: false, label: 'Drive', hint: null };
  else if (mode === 'failsafe') drive = { enabled: false, label: 'Drive', hint: 'Reset first' };
  else drive = { enabled: connected && allowed.includes('manual'), label: 'Drive', hint: null };

  const drives = known && !changing && (mode === 'manual' || mode === 'mapping');
  const joystick = { shown: drives, enabled: drives && connected };

  const explore = { enabled: connected && mapping, hint: null };

  return { goTo, drive, joystick, stop, mapping, exploring, makingMap, explore, newMap, dock, reset };
}
