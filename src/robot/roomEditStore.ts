// The rooms being changed on the Home tab: a copy of the robot's rooms, edited on the phone and
// sent with Save (rooms.ts says how). No imports but types, so the client can close the editor
// on disconnect without an import cycle.

import { create } from 'zustand';

import type { Room } from '../transport/messages';

/** A request on its way: finding the rooms, naming them by looking, or saving them. */
export type RoomWork = 'finding' | 'naming' | 'saving';

export interface RoomEditState {
  open: boolean;
  mapName: string; // the map whose rooms are being changed
  draft: Room[];
  work: RoomWork | null; // while one is on its way, the other buttons wait
  renaming: number | null; // index into draft: the name dialog is open for that room
}

export const CLOSED_ROOM_EDIT: RoomEditState = { open: false, mapName: '', draft: [], work: null, renaming: null };

export const useRoomEdit = create<RoomEditState>(() => CLOSED_ROOM_EDIT);

export function resetRoomEdit(): void {
  useRoomEdit.setState(CLOSED_ROOM_EDIT);
}
