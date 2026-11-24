// Friendly names and colours for the modes this app knows. The robot decides which modes exist:
// a mode not listed here is shown by its own name in grey, so a robot with a newer mode still
// works with this app.

export interface ModeLook {
  label: string;
  color: string; // the mode's own colour: its text, its outline
  background: string; // a light tint of it, behind the mode's name in the status strip
}

const KNOWN: Record<string, ModeLook> = {
  idle: { label: 'Idle', color: '#4b5563', background: '#eceef0' },
  mapping: { label: 'Mapping', color: '#2c5bd8', background: '#e6edfc' },
  navigation: { label: 'Navigation', color: '#3f6b1e', background: '#edf5e6' },
  manual: { label: 'Manual', color: '#a6461a', background: '#fcebdd' },
  cleaning: { label: 'Cleaning', color: '#0b6b73', background: '#e3f1f1' },
  exploring: { label: 'Exploring', color: '#185c94', background: '#e5eff8' },
  docking: { label: 'Docking', color: '#6a35a3', background: '#f1e8fa' },
  docked: { label: 'Docked', color: '#22603a', background: '#e2f2e7' },
  failsafe: { label: 'Failsafe', color: '#c62f2a', background: '#fbe6e4' },
};

const UNKNOWN: Omit<ModeLook, 'label'> = { color: '#5a6763', background: '#eceef0' };

export function modeLook(mode: string): ModeLook {
  return KNOWN[mode] ?? { label: mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Unknown', ...UNKNOWN };
}

// Who the safety gate lets drive (SafetyStatus.source).
const DRIVERS: Record<string, string> = {
  none: 'Nobody',
  manual: 'Joystick or keyboard',
  nav2: 'Navigation (Nav2)',
};

export function driverLabel(source: string): string {
  return DRIVERS[source] ?? source;
}
