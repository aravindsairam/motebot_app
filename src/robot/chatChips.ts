// The suggestions above the chat's input: a tap asks at once. Chosen from what the robot is doing,
// and from the saved rooms. Plain data in, plain data out.

export const MAX_CHIPS = 6;

export interface ChipsInput {
  connected: boolean;
  mode: string; // the robot's mode; '' when not known (no recent robot state)
  cleaning: 'none' | 'running' | 'paused'; // a clean under way, from the cleaning status
  rooms: readonly string[]; // the saved rooms' names, in the robot's order
}

export function chipsFor({ connected, mode, cleaning, rooms }: ChipsInput): string[] {
  if (!connected) return [];
  let chips: string[];
  if (cleaning !== 'none' || mode === 'cleaning') {
    chips = ['How is the clean going?', cleaning === 'paused' ? 'Resume' : 'Pause', 'Stop and go home'];
  } else if (mode === 'idle' || mode === 'docked') {
    const named = rooms.map((r) => r.trim()).filter((r) => r).slice(0, 2);
    chips = ['What can you do?', 'What do you see?', 'How was the last clean?', 'Clean everything'];
    // The clean chips first: with two rooms, the six chips keep a clean for each.
    if (named.length > 0) chips.push(...named.map((r) => `Clean the ${r}`), ...named.map((r) => `Is the ${r} clean?`));
    else chips.push('Find the rooms');
  } else if (mode === 'failsafe') {
    chips = ['What went wrong?', 'What can you do?'];
  } else if (mode) {
    chips = ['What are you doing?', 'What do you see?'];
  } else {
    chips = ['What can you do?'];
  }
  return chips.slice(0, MAX_CHIPS);
}
