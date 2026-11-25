// The rooms being changed on the Home tab: a copy of the robot's rooms, edited on the phone and
// sent with Save (rooms.ts says how). No imports but types, so the client can close the editor
// on disconnect without an import cycle.

import { create } from 'zustand';

import type { Room } from '../transport/messages';

/** A request on its way: finding the rooms, naming them by looking, joining or splitting, or saving them. */
export type RoomWork = 'finding' | 'naming' | 'changing' | 'saving';

/** A tool in hand: the next taps on the map pick two rooms to join, or the two ends of a line to
 *  split a room along. */
export type RoomTool = 'join' | 'split';

export interface RoomEditState {
  open: boolean;
  mapName: string; // the map whose rooms are being changed
  draft: Room[];
  work: RoomWork | null; // while one is on its way, the other buttons wait
  renaming: number | null; // index into draft: the name dialog is open for that room
  tool: RoomTool | null;
  picked: number | null; // Join: index into draft of the first room tapped
  from: { x: number; y: number } | null; // Split: the first end of the line, metres
}

export const CLOSED_ROOM_EDIT: RoomEditState = {
  open: false,
  mapName: '',
  draft: [],
  work: null,
  renaming: null,
  tool: null,
  picked: null,
  from: null,
};

export const useRoomEdit = create<RoomEditState>(() => CLOSED_ROOM_EDIT);

export function resetRoomEdit(): void {
  useRoomEdit.setState(CLOSED_ROOM_EDIT);
}
