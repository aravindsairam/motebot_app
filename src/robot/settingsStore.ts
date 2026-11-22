// The settings as the controls show them: what the robot holds, the change the user has made that
// the robot has not answered for yet, and the request on its way (settingsSync.ts says how they
// move). The robot's own report, with its limits, is in the robot store like every other message.
// No imports but types and plain arithmetic, so the client can clear it on disconnect without an
// import cycle.

import { create } from 'zustand';

import { NO_SYNC, type SettingsSync } from './settingsSync';

export const useSettings = create<SettingsSync>(() => NO_SYNC);

export function resetSettings(): void {
  useSettings.setState(NO_SYNC);
}
