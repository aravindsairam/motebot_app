import type { SettingsLimits, SettingsValues } from '../transport/messages';
import { settingsView } from './settingsView';

const f = Math.fround; // a number as it arrives from the robot: a 32-bit float

const LIMITS: SettingsLimits = {
  cleaningSpeedMin: f(0.1),
  cleaningSpeedMax: f(0.3),
  manualSpeedMin: f(0.1),
  manualSpeedMax: f(0.3),
  rowSpacingMin: f(0.1),
  rowSpacingMax: f(0.3),
  rowSpacingStep: f(0.05),
};
const VALUES: SettingsValues = { cleaningSpeed: f(0.2), manualSpeed: f(0.3), rowSpacing: f(0.25), rowAngleAuto: true, rowAngle: 0 };

describe('the Settings card', () => {
  it('shows each value in its own unit, with the buttons that have somewhere to go', () => {
    expect(settingsView(VALUES, LIMITS, true)).toEqual({
      enabled: true,
      known: true,
      cleaningSpeed: { text: '0.20 m/s', less: true, more: true },
      manualSpeed: { text: '0.30 m/s', less: true, more: false }, // at its upper limit
      rowSpacing: { text: '25 cm', less: true, more: true },
      rowAngleAuto: true,
      rowAngle: null,
      rowsTurn: 0,
    });
  });

  it('has minus off at the lower limit', () => {
    const view = settingsView({ ...VALUES, cleaningSpeed: f(0.1), rowSpacing: f(0.1) }, LIMITS, true);
    expect(view.cleaningSpeed).toEqual({ text: '0.10 m/s', less: false, more: true });
    expect(view.rowSpacing).toEqual({ text: '10 cm', less: false, more: true });
  });

  it('with Auto off, shows the angle and turns the drawing; the angle goes round, so both buttons work', () => {
    const view = settingsView({ ...VALUES, rowAngleAuto: false, rowAngle: 45 }, LIMITS, true);
    expect(view.rowAngleAuto).toBe(false);
    expect(view.rowAngle).toEqual({ text: '45°', less: true, more: true });
    expect(view.rowsTurn).toBe(-45);
    expect(settingsView({ ...VALUES, rowAngleAuto: false, rowAngle: 0 }, LIMITS, true).rowAngle).toEqual({ text: '0°', less: true, more: true });
    expect(settingsView({ ...VALUES, rowAngleAuto: false, rowAngle: 175 }, LIMITS, true).rowAngle).toEqual({ text: '175°', less: true, more: true });
  });

  it('shows a value set from elsewhere as it is, between two steps', () => {
    const view = settingsView({ ...VALUES, cleaningSpeed: 0.125, rowSpacing: 0.1875, rowAngleAuto: false, rowAngle: 37.5 }, LIMITS, true);
    expect(view.cleaningSpeed).toEqual({ text: '0.125 m/s', less: true, more: true });
    expect(view.rowSpacing.text).toBe('18.8 cm');
    expect(view.rowAngle?.text).toBe('37.5°');
    expect(view.rowsTurn).toBe(-37.5);
  });

  it('is greyed, with nothing to press, until the robot has sent its settings', () => {
    const view = settingsView(null, null, true);
    expect(view).toMatchObject({ enabled: false, known: false, rowAngleAuto: false, rowAngle: null });
    for (const stepper of [view.cleaningSpeed, view.manualSpeed, view.rowSpacing]) expect(stepper).toEqual({ text: '-', less: false, more: false });
  });

  it('is greyed without a connection: the last values stay, nothing can be pressed', () => {
    const view = settingsView({ ...VALUES, rowAngleAuto: false, rowAngle: 90 }, LIMITS, false);
    expect(view.enabled).toBe(false);
    expect(view.known).toBe(true);
    expect(view.cleaningSpeed).toEqual({ text: '0.20 m/s', less: false, more: false });
    expect(view.rowSpacing).toEqual({ text: '25 cm', less: false, more: false });
    expect(view.rowAngle).toEqual({ text: '90°', less: false, more: false });
  });

  it('a robot that sent no limits: the values show, the steppers that need limits are off', () => {
    const none: SettingsLimits = { cleaningSpeedMin: 0, cleaningSpeedMax: 0, manualSpeedMin: 0, manualSpeedMax: 0, rowSpacingMin: 0, rowSpacingMax: 0, rowSpacingStep: 0 };
    for (const limits of [none, null]) {
      const view = settingsView({ ...VALUES, rowAngleAuto: false, rowAngle: 45 }, limits, true);
      expect(view.enabled).toBe(true);
      expect(view.cleaningSpeed).toEqual({ text: '0.20 m/s', less: false, more: false });
      expect(view.rowSpacing).toEqual({ text: '25 cm', less: false, more: false });
      expect(view.rowAngle).toEqual({ text: '45°', less: true, more: true });
    }
  });
});
