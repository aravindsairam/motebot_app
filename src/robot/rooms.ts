// Changing the rooms from the phone. The Rooms button on the Home map opens an editor on a copy of
// the robot's rooms. Find rooms asks the robot to split the map at its doorways (a proposal that
// replaces the copy); Name by looking sends the robot to each room to look and name it (a few
// minutes); a tap on a room renames it; Delete takes one off the list. Save sends the whole list.
// Nothing changes on the robot until Save. When the robot says no, the message card says why and
// editing goes on.
//
// No split of a map is right every time, so two tools put it right by hand. Join: tap two rooms
// that touch, and they become one. Split: tap the two ends of a line across a room, and it becomes
// two. The robot does both on its map and answers with the rooms as they are then; with a tool in
// hand a tap picks, and does not rename. A tool is put away once it has done its work.
//
// The rooms belong to the map in use, so the editor opens under the same rule as the no-go zones.

import type { AssistantStatus, Room, RoomsChange } from '../transport/messages';
import { showNotice, showRefusal } from './actionsStore';
import { editRooms, findRooms, nameRooms, setRooms } from './commands';
import { CLOSED_ROOM_EDIT, type RoomEditState, type RoomTool, type RoomWork, useRoomEdit } from './roomEditStore';
import { insidePolygon } from './spot';
import { useRobot } from './store';

export const MAX_ROOM_NAME = 40;

const toCm = (metres: number) => Math.round(metres * 100);

function copyRoom(r: Room): Room {
  return { ...r, points: [...r.points] };
}

/** What is wrong with `name` for the room at `index` of `rooms`, or null. Names are 1 to 40
 *  characters, and no two rooms have the same one (whatever the capitals). */
export function roomNameProblem(name: string, rooms: readonly { name: string }[], index: number): string | null {
  const n = name.trim();
  if (!n) return 'Give the room a name';
  if (n.length > MAX_ROOM_NAME) return 'At most 40 characters';
  const key = n.toLowerCase();
  if (rooms.some((r, i) => i !== index && r.name.trim().toLowerCase() === key)) return 'Another room has this name';
  return null;
}

/** The first problem with the names before they go to the robot, or null. */
export function roomsProblem(rooms: readonly { name: string }[]): string | null {
  for (let i = 0; i < rooms.length; i++) {
    const problem = roomNameProblem(rooms[i].name, rooms, i);
    if (problem === null) continue;
    const name = rooms[i].name.trim();
    if (!name) return 'Every room needs a name';
    if (name.length > MAX_ROOM_NAME) return `The name '${name.slice(0, 20)}…' is longer than 40 characters`;
    return `Two rooms are called '${name}'`;
  }
  return null;
}

/** "12.8 m²": always one decimal. */
export function roomAreaText(m2: number): string {
  return `${Math.max(0, m2).toFixed(1)} m²`;
}

export function roomsCount(n: number): string {
  return n === 0 ? 'No rooms' : n === 1 ? 'One room' : `${n} rooms`;
}

/** The room whose outline holds (x, y), metres; null when none. */
export function roomAt(rooms: readonly Room[], x: number, y: number): number | null {
  for (let i = rooms.length - 1; i >= 0; i--) if (rooms[i].points.length >= 6 && insidePolygon(rooms[i].points, x, y)) return i;
  return null;
}

/** Where a room's name goes on the map: the middle of its outline (its area's centre). The robot's
 *  own point for a room is where it stands to look in, just inside a doorway, so names there sit on
 *  the doorway and can cover each other. For a room shaped so its middle is outside it (an L), the
 *  robot's point is used. */
export function labelPoint(room: Pick<Room, 'points' | 'x' | 'y'>): { x: number; y: number } {
  const p = room.points;
  const n = Math.floor(p.length / 2);
  if (n < 3) return { x: room.x, y: room.y };
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const x0 = p[2 * i];
    const y0 = p[2 * i + 1];
    const x1 = p[2 * ((i + 1) % n)];
    const y1 = p[2 * ((i + 1) % n) + 1];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(a) < 1e-9) return { x: room.x, y: room.y };
  const middle = { x: cx / (3 * a), y: cy / (3 * a) };
  return insidePolygon(p, middle.x, middle.y) ? middle : { x: room.x, y: room.y };
}

/** Are the rooms the same as the robot's, to the centimetre the robot keeps? */
export function sameRooms(a: readonly Room[], b: readonly Room[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => {
    const w = b[i];
    if (r.name.trim() !== w.name.trim() || toCm(r.x) !== toCm(w.x) || toCm(r.y) !== toCm(w.y)) return false;
    if (Math.fround(r.area) !== Math.fround(w.area) || r.points.length !== w.points.length) return false;
    return r.points.every((v, k) => toCm(v) === toCm(w.points[k]));
  });
}

/** The names the robot gave by looking, put on the rooms being edited. The robot answers with the
 *  same rooms: each takes the name of the one at the same spot (or else in the same place in the
 *  list). If the robot sent a different number of rooms, its list is taken as it is. */
export function withNames(draft: readonly Room[], named: readonly Room[]): Room[] {
  if (named.length !== draft.length) return named.map(copyRoom);
  return draft.map((r, i) => {
    const same = named.find((n) => toCm(n.x) === toCm(r.x) && toCm(n.y) === toCm(r.y)) ?? named[i];
    return { ...copyRoom(r), name: same.name.trim() || r.name };
  });
}

/** What the next tap does with a tool in hand; null with none. */
export function roomToolPrompt(s: Pick<RoomEditState, 'tool' | 'picked' | 'from' | 'draft'>): string | null {
  if (s.tool === 'join') {
    const first = s.picked !== null ? s.draft[s.picked] : undefined;
    return first ? `Join: now tap the room next to ${first.name}` : 'Join: tap the first room';
  }
  if (s.tool === 'split') return s.from ? 'Split: now tap where it ends' : 'Split: tap where the dividing line starts';
  return null;
}

/** The line in the editor: what is going on, or what to do next. `status`: what the robot says it
 *  is doing (naming the rooms, it says which room it is going to). */
export function roomEditLine(
  s: Pick<RoomEditState, 'work' | 'draft'> & Partial<Pick<RoomEditState, 'tool' | 'picked' | 'from'>>,
  status: AssistantStatus | null,
): string {
  const tool = { tool: s.tool ?? null, picked: s.picked ?? null, from: s.from ?? null, draft: s.draft };
  switch (s.work) {
    case 'finding':
      return 'Finding the rooms on the map…';
    case 'naming':
      return status?.busy && status.doing ? `Naming the rooms: ${status.doing}…` : 'Naming the rooms: the robot goes to look into each one…';
    case 'changing':
      return tool.tool === 'split' ? 'Splitting the room…' : 'Joining the rooms…';
    case 'saving':
      return 'Saving the rooms on the robot…';
    default:
      return (
        roomToolPrompt(tool) ??
        (s.draft.length === 0 ? 'No rooms yet. Find rooms splits the map at its doorways.' : `${roomsCount(s.draft.length)}. Tap a name to rename it.`)
      );
  }
}

/** The robot's rooms of the map being edited: none when it has sent another map's. */
function robotRooms(mapName: string): Room[] {
  const rooms = useRobot.getState().rooms?.value;
  return rooms && rooms.mapName === mapName ? rooms.rooms : [];
}

/** Has anything changed from the robot's rooms? */
export function roomsEdited(): boolean {
  const s = useRoomEdit.getState();
  return !sameRooms(s.draft, robotRooms(s.mapName));
}

let seq = 0; // the newest request; an answer to an older one, or one after the editor closed, is dropped

/** Start editing a copy of the robot's rooms of the map in use. Returns why not, or null. */
export function openRoomEditor(): string | null {
  const { robotState, rooms } = useRobot.getState();
  const mapName = robotState?.value.currentMap ?? '';
  if (!mapName) return 'There is no saved map yet';
  // Rooms of another map: this map's have not come yet, and Save would replace rooms the phone never saw.
  if (rooms && rooms.value.rooms.length > 0 && rooms.value.mapName !== mapName) return "The robot hasn't sent this map's rooms yet";
  seq++;
  useRoomEdit.setState({ ...CLOSED_ROOM_EDIT, open: true, mapName, draft: robotRooms(mapName).map(copyRoom) });
  return null;
}

/** Cancel, or the robot left the map: the copy is dropped. */
export function closeRoomEditor(): void {
  seq++;
  useRoomEdit.setState(CLOSED_ROOM_EDIT);
}

/** Begin a request, unless the editor is closed or another is on its way. Returns its number. */
function begin(work: RoomWork): number | null {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null) return null;
  // A tool stays in hand only for its own request; whatever it had picked is let go.
  useRoomEdit.setState({ work, renaming: null, picked: null, from: null, tool: work === 'changing' ? s.tool : null });
  showNotice(null);
  return ++seq;
}

function stillWanted(id: number): boolean {
  return id === seq && useRoomEdit.getState().open;
}

/** Find rooms: the robot's proposal replaces the rooms being edited. */
export async function findRoomsOnMap(): Promise<void> {
  const id = begin('finding');
  if (id === null) return;
  const answer = await findRooms();
  if (!stillWanted(id)) return;
  if (answer.rooms === null) {
    useRoomEdit.setState({ work: null });
    showRefusal("Couldn't find the rooms", answer.text || 'the robot gave no reason');
    return;
  }
  useRoomEdit.setState({ work: null, draft: answer.rooms });
  if (answer.rooms.length === 0) showNotice({ tone: 'info', title: 'No rooms found', text: 'The robot found no rooms on this map.' });
}

/** Name by looking: the robot drives to each room, looks and names it. The names replace the ones
 *  being edited; nothing is saved until Save. */
export async function nameRoomsByLooking(): Promise<void> {
  const before = useRoomEdit.getState().draft;
  if (before.length === 0) return;
  const id = begin('naming');
  if (id === null) return;
  const answer = await nameRooms(before);
  if (!stillWanted(id)) return;
  if (answer.rooms === null) {
    useRoomEdit.setState({ work: null });
    showRefusal("Couldn't name the rooms", answer.text || 'the robot gave no reason');
    return;
  }
  useRoomEdit.setState({ work: null, draft: withNames(useRoomEdit.getState().draft, answer.rooms) });
  showNotice({ tone: 'success', title: 'Rooms named', text: 'Check the names, then Save.' });
}

/** Save: the whole list goes to the robot. On OK the editor closes and every phone gets the rooms. */
export async function saveRooms(): Promise<void> {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null) return;
  const problem = roomsProblem(s.draft);
  if (problem) {
    showRefusal("Can't save the rooms", problem);
    return;
  }
  const rooms = s.draft.map((r) => ({ ...r, name: r.name.trim() }));
  const id = begin('saving');
  if (id === null) return;
  const outcome = await setRooms(s.mapName, rooms);
  if (!stillWanted(id)) return;
  if (!outcome.ok) {
    useRoomEdit.setState({ work: null });
    showRefusal("Couldn't save the rooms", outcome.text || 'the robot gave no reason');
    return;
  }
  closeRoomEditor();
  const n = rooms.length;
  showNotice({
    tone: 'success',
    title: 'Rooms saved',
    text: n === 0 ? 'The map has no rooms now.' : `The robot knows ${n === 1 ? 'one room' : `${n} rooms`} on this map.`,
  });
}

/** Take a tool in hand, or put it away when it is the one in hand. Not while a request is on its way. */
export function toggleRoomTool(tool: RoomTool): void {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null) return;
  useRoomEdit.setState({ tool: s.tool === tool ? null : tool, picked: null, from: null, renaming: null });
}

/** Join or split: the robot's answer replaces the rooms being edited, and the tool is put away.
 *  When the robot says no, the message card says why and the tool stays in hand for another try. */
async function changeRooms(tool: RoomTool, change: RoomsChange): Promise<void> {
  const before = useRoomEdit.getState().draft;
  const id = begin('changing');
  if (id === null) return;
  const answer = await editRooms(before, change);
  if (!stillWanted(id)) return;
  if (answer.rooms === null) {
    useRoomEdit.setState({ work: null });
    showRefusal(tool === 'join' ? "Couldn't join the rooms" : "Couldn't split the room", answer.text || 'the robot gave no reason');
    return;
  }
  useRoomEdit.setState({ work: null, tool: null, draft: answer.rooms });
  showNotice(
    tool === 'join'
      ? { tone: 'success', title: 'Rooms joined', text: 'Check the rooms, then Save.' }
      : { tone: 'success', title: 'Room split', text: 'Tap the new room to name it, then Save.' },
  );
}

/** A tap on a room, on the map or in the list. With Join in hand it picks the room (the second
 *  one picked joins the two; the same one again lets go of it); otherwise it opens its name. */
export async function pickRoom(index: number): Promise<void> {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null || index < 0 || index >= s.draft.length) return;
  if (s.tool !== 'join') {
    if (s.tool === null) startRenaming(index);
    return;
  }
  if (s.picked === null || s.picked >= s.draft.length) useRoomEdit.setState({ picked: index });
  else if (s.picked === index) useRoomEdit.setState({ picked: null });
  else await changeRooms('join', { join: [s.picked, index] });
}

/** Open the name dialog for a room. Not while a request is on its way. */
export function startRenaming(index: number): void {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null || index < 0 || index >= s.draft.length) return;
  useRoomEdit.setState({ renaming: index });
}

export function stopRenaming(): void {
  useRoomEdit.setState({ renaming: null });
}

/** Give a room a new name. Returns what is wrong with the name (nothing changes then), or null. */
export function renameRoom(index: number, name: string): string | null {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null || index < 0 || index >= s.draft.length) return 'The rooms cannot be changed now';
  const problem = roomNameProblem(name, s.draft, index);
  if (problem) return problem;
  const draft = s.draft.slice();
  draft[index] = { ...draft[index], name: name.trim() };
  useRoomEdit.setState({ draft, renaming: null });
  return null;
}

export function deleteRoom(index: number): void {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null) return;
  useRoomEdit.setState({ draft: s.draft.filter((_, i) => i !== index), renaming: null, picked: null });
}

/** A tap on the map at (x, y), metres, while editing. With Split in hand it sets an end of the
 *  line (the second end splits the room); otherwise it is a tap on the room there. */
export async function tapRooms(x: number, y: number): Promise<void> {
  const s = useRoomEdit.getState();
  if (!s.open || s.work !== null) return;
  if (s.tool === 'split') {
    if (s.from === null) useRoomEdit.setState({ from: { x, y } });
    else await changeRooms('split', { cut: [s.from.x, s.from.y, x, y] });
    return;
  }
  const index = roomAt(s.draft, x, y);
  if (index !== null) await pickRoom(index);
}
