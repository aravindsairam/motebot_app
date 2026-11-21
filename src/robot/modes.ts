// Friendly names and colours for the modes this app knows. The robot decides which modes exist:
// a mode not listed here is shown by its own name in grey, so a robot with a newer mode still
// works with this app.

export interface ModeLook {
  label: string;
  color: string;
}

const KNOWN: Record<string, ModeLook> = {
  idle: { label: 'Idle', color: '#4b5563' },
  mapping: { label: 'Mapping', color: '#1d4ed8' },
  navigation: { label: 'Navigation', color: '#15803d' },
  manual: { label: 'Manual', color: '#c2410c' },
  cleaning: { label: 'Cleaning', color: '#0e7490' },
  exploring: { label: 'Exploring', color: '#0369a1' },
  docking: { label: 'Docking', color: '#7e22ce' },
  docked: { label: 'Docked', color: '#0f766e' },
  failsafe: { label: 'Failsafe', color: '#dc2626' },
};

const UNKNOWN_COLOR = '#6b7280';

export function modeLook(mode: string): ModeLook {
  return KNOWN[mode] ?? { label: mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Unknown', color: UNKNOWN_COLOR };
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
