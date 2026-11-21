import type { RobotState } from '../transport/messages';
import { controlsFor } from './controls';

function robot(state: string, extra: Partial<RobotState> = {}): RobotState {
  return {
    state,
    previousState: '',
    reason: '',
    transitioning: false,
    allowedTransitions: ['idle', 'mapping', 'navigation', 'manual', 'docking', 'failsafe'].filter((m) => m !== state),
    faults: [],
    currentMap: 'house',
    enteredTime: 0,
    makingMap: state === 'mapping' || state === 'exploring',
    ...extra,
  };
}

describe('Stop', () => {
  it.each(['manual', 'navigation', 'docking', 'mapping', 'exploring'])('is usable while the robot is in %s', (mode) => {
    expect(controlsFor(robot(mode), true, true).stop.enabled).toBe(true);
  });

  it.each(['idle', 'docked', 'failsafe'])('has nothing to stop in %s', (mode) => {
    expect(controlsFor(robot(mode), true, true).stop.enabled).toBe(false);
  });

  it('is usable during a mode change, even one towards idle', () => {
    expect(controlsFor(robot('idle', { transitioning: true }), true, true).stop.enabled).toBe(true);
  });

  it('is usable when the robot state is old: nobody knows whether it is moving', () => {
    expect(controlsFor(robot('idle'), false, true).stop.enabled).toBe(true);
    expect(controlsFor(null, false, true).stop.enabled).toBe(true);
  });

  it('is not usable without a connection', () => {
    expect(controlsFor(robot('manual'), false, false).stop.enabled).toBe(false);
  });

  it('in mapping only stops the motion: leaving mapping would lose the map being made', () => {
    expect(controlsFor(robot('mapping'), true, true).stop).toEqual({ enabled: true, halts: true });
    expect(controlsFor(robot('mapping'), true, true).mapping).toBe(true);
    expect(controlsFor(robot('manual'), true, true).stop.halts).toBe(false);
    expect(controlsFor(robot('mapping', { transitioning: true }), true, true).stop.halts).toBe(false);
  });
});

describe('Dock', () => {
  it('is usable when the robot allows docking', () => {
    expect(controlsFor(robot('idle'), true, true).dock).toEqual({ enabled: true, label: 'Dock', hint: null, asksFirst: false });
  });

  it('asks first in mapping, where docking would lose the map being made', () => {
    expect(controlsFor(robot('mapping'), true, true).dock).toMatchObject({ enabled: true, asksFirst: true });
  });

  it('says why not: no map', () => {
    const r = robot('idle', { currentMap: '', allowedTransitions: ['mapping', 'manual', 'failsafe'] });
    expect(controlsFor(r, true, true).dock).toEqual({ enabled: false, label: 'Dock', hint: 'Make a map first', asksFirst: false });
  });

  it('says why not: failsafe', () => {
    const r = robot('failsafe', { allowedTransitions: ['idle'] });
    expect(controlsFor(r, true, true).dock).toEqual({ enabled: false, label: 'Dock', hint: 'Reset first', asksFirst: false });
  });

  it('shows docking and docked as what is happening', () => {
    expect(controlsFor(robot('docking'), true, true).dock).toEqual({ enabled: false, label: 'Docking…', hint: null, asksFirst: false });
    expect(controlsFor(robot('docked'), true, true).dock).toEqual({ enabled: false, label: 'Docked', hint: null, asksFirst: false });
  });

  it('waits during a mode change and when the state is old', () => {
    expect(controlsFor(robot('idle', { transitioning: true }), true, true).dock.enabled).toBe(false);
    expect(controlsFor(robot('idle'), false, true).dock.enabled).toBe(false);
  });
});

describe('Reset', () => {
  it('is usable in failsafe once the robot allows idle', () => {
    expect(controlsFor(robot('failsafe', { allowedTransitions: ['idle'] }), true, true).reset).toEqual({ enabled: true, hint: null, target: 'idle' });
  });

  it('waits for the faults to clear', () => {
    const r = robot('failsafe', { allowedTransitions: [], faults: ['lidar data stopped'] });
    expect(controlsFor(r, true, true).reset).toEqual({ enabled: false, hint: 'Waiting for the faults to clear', target: 'idle' });
  });

  it('is not shown outside failsafe', () => {
    expect(controlsFor(robot('idle'), true, true).reset).toEqual({ enabled: false, hint: null, target: 'idle' });
  });
});

describe('Drive and the joystick', () => {
  it('asks for manual mode when the robot allows it', () => {
    expect(controlsFor(robot('idle'), true, true).drive).toEqual({ enabled: true, label: 'Drive', hint: null });
    expect(controlsFor(robot('navigation', { allowedTransitions: ['idle'] }), true, true).drive.enabled).toBe(false);
    expect(controlsFor(robot('failsafe', { allowedTransitions: ['idle'] }), true, true).drive).toEqual({
      enabled: false,
      label: 'Drive',
      hint: 'Reset first',
    });
  });

  it('shows the joystick in manual and mapping, once the change has finished', () => {
    expect(controlsFor(robot('manual'), true, true).joystick).toEqual({ shown: true, enabled: true });
    expect(controlsFor(robot('manual'), true, true).drive).toEqual({ enabled: false, label: 'Driving', hint: null });
    expect(controlsFor(robot('mapping'), true, true).joystick.shown).toBe(true);
    expect(controlsFor(robot('manual', { transitioning: true }), true, true).joystick.shown).toBe(false);
    expect(controlsFor(robot('navigation'), true, true).joystick.shown).toBe(false);
  });

  it('greys the joystick without a connection', () => {
    expect(controlsFor(robot('manual'), true, false).joystick).toEqual({ shown: true, enabled: false });
  });
});

describe('New map', () => {
  it('asks for mapping when the robot allows it, with or without a map', () => {
    expect(controlsFor(robot('idle'), true, true).newMap).toEqual({ enabled: true, hint: null });
    expect(controlsFor(robot('docked', { currentMap: '' }), true, true).newMap.enabled).toBe(true);
  });

  it('is not offered while mapping, and waits for a reset in failsafe', () => {
    expect(controlsFor(robot('mapping'), true, true).newMap.enabled).toBe(false);
    expect(controlsFor(robot('failsafe', { allowedTransitions: ['idle'] }), true, true).newMap).toEqual({ enabled: false, hint: 'Reset first' });
  });
});

describe('Reset keeps the map being made when the robot offers it', () => {
  it('goes back to mapping when the robot offers mapping', () => {
    const r = robot('failsafe', { allowedTransitions: ['mapping'], makingMap: true, previousState: 'exploring' });
    expect(controlsFor(r, true, true).reset).toEqual({ enabled: true, hint: null, target: 'mapping' });
  });

  it('goes to idle otherwise', () => {
    expect(controlsFor(robot('failsafe', { allowedTransitions: ['idle'] }), true, true).reset.target).toBe('idle');
  });
});

describe('Exploring', () => {
  it('Explore is offered while mapping, once the change has finished', () => {
    expect(controlsFor(robot('mapping'), true, true).explore).toEqual({ enabled: true, hint: null });
    expect(controlsFor(robot('mapping', { transitioning: true }), true, true).explore.enabled).toBe(false);
    expect(controlsFor(robot('mapping'), true, false).explore.enabled).toBe(false);
    expect(controlsFor(robot('idle'), true, true).explore.enabled).toBe(false);
  });

  it('while exploring: Stop asks the robot to stop (it keeps the map), no joystick, no Save or Discard', () => {
    const c = controlsFor(robot('exploring', { allowedTransitions: ['mapping', 'idle', 'failsafe'] }), true, true);
    expect(c.stop).toEqual({ enabled: true, halts: false });
    expect(c.joystick.shown).toBe(false);
    expect(c.exploring).toBe(true);
    expect(c.mapping).toBe(false);
    expect(c.explore.enabled).toBe(false);
  });

  it('treats exploring like mapping where leaving would lose the map', () => {
    const r = robot('exploring', { allowedTransitions: ['mapping', 'idle', 'failsafe'] });
    const c = controlsFor(r, true, true);
    expect(c.makingMap).toBe(true);
    expect(c.newMap.enabled).toBe(false);
    expect(c.goTo).toEqual({ enabled: false, hint: 'Not while mapping' });
    expect(c.dock.enabled).toBe(false); // the robot does not allow it from exploring
  });

  it('a gateway that does not send making_map yet: the mode decides', () => {
    const r = robot('exploring', { makingMap: false });
    expect(controlsFor(r, true, true).makingMap).toBe(true);
  });
});
