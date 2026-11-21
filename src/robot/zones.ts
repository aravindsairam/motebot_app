// Changing the no-go zones from the phone: a copy of the robot's zones is edited on the map (add a
// rectangle, move or resize it, delete one), and Save sends the whole list to the robot, which
// saves it with the map and makes Nav2 keep out at once. Nothing changes on the robot until Save.
//
// The zones belong to the map in use. They can be changed while the robot is idle, docked,
// driving or navigating; not while it makes a new map (there is no saved map yet) or cleans (the
// rows were planned around the old zones). The robot checks everything again and says why when it
// refuses (a zone over the robot, too close to the dock, ...).

import { create } from 'zustand';

import { showNotice } from './actionsStore';
import { type Box, boxAround, boxCorners, boxFrom } from './cleanArea';
import { sendSetNoGoZones } from './commands';
import { insidePolygon } from './spot';
import { useRobot } from './store';

/** A zone being edited: its name and corners x0, y0, x1, y1, ... in metres, map coordinates. */
export interface DraftZone {
  name: string;
  points: number[];
}

export const NEW_ZONE_SIZE_M = 1; // a tap while adding places a square this wide
export const MIN_ZONE_SIDE_M = 0.1; // the robot refuses narrower zones

export interface ZoneEditState {
  open: boolean;
  mapName: string; // the map whose zones are being edited
  draft: DraftZone[];
  selected: number | null; // index into draft
  adding: boolean; // the next tap or drag on the map makes a new zone
  saving: boolean;
  problem: string | null; // why the zones were not saved, in the robot's words where it gave them
}

const closed: ZoneEditState = { open: false, mapName: '', draft: [], selected: null, adding: false, saving: false, problem: null };

export const useZoneEdit = create<ZoneEditState>(() => closed);

/** The zone as a rectangle along the map's axes, or null when it has another shape. */
export function zoneBox(points: ArrayLike<number>): Box | null {
  if (points.length !== 8) return null;
  const xs = [points[0], points[2], points[4], points[6]];
  const ys = [points[1], points[3], points[5], points[7]];
  const b = boxFrom(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  const near = (a: number, c: number) => Math.abs(a - c) < 0.005;
  for (let i = 0; i < 4; i++) {
    if (!(near(xs[i], b.x0) || near(xs[i], b.x1)) || !(near(ys[i], b.y0) || near(ys[i], b.y1))) return null;
  }
  // all four corners, not the same one twice
  const corners = new Set(xs.map((x, i) => `${near(x, b.x0) ? 0 : 1}${near(ys[i], b.y0) ? 0 : 1}`));
  return corners.size === 4 ? b : null;
}

/** "Zone 1", or the lowest number not yet taken. */
export function nextZoneName(zones: readonly DraftZone[]): string {
  const taken = new Set(zones.map((z) => z.name));
  let n = 1;
  while (taken.has(`Zone ${n}`)) n++;
  return `Zone ${n}`;
}

/** The zone under (x, y): the one drawn last (on top) first; null when none. */
export function zoneAt(zones: readonly DraftZone[], x: number, y: number): number | null {
  for (let i = zones.length - 1; i >= 0; i--) if (insidePolygon(zones[i].points, x, y)) return i;
  return null;
}

/** Are the zones the same as the robot's, to the centimetre the robot keeps? */
export function sameZones(a: readonly { name: string; points: ArrayLike<number> }[], b: readonly { name: string; points: ArrayLike<number> }[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((z, i) => {
    const w = b[i];
    if (z.name !== w.name || z.points.length !== w.points.length) return false;
    for (let k = 0; k < z.points.length; k++) if (Math.round(z.points[k] * 100) !== Math.round(w.points[k] * 100)) return false;
    return true;
  });
}

/** What is wrong with the zones before they go to the robot, or null. */
export function zonesProblem(zones: readonly DraftZone[]): string | null {
  for (const z of zones) {
    const b = zoneBox(z.points);
    if (b && (b.x1 - b.x0 < MIN_ZONE_SIDE_M || b.y1 - b.y0 < MIN_ZONE_SIDE_M)) return `${z.name} is too small: make it at least 10 cm across`;
  }
  return null;
}

/** Why the zones cannot be changed now, or null when they can. */
export function whyNoZoneEdit(mode: string, currentMap: string, live: boolean, makingMap = false): string | null {
  if (!live) return 'The robot is not connected';
  if (makingMap || mode === 'mapping' || mode === 'exploring') return 'Save or discard the new map first';
  if (mode === 'cleaning') return 'Stop the clean first';
  if (!currentMap) return 'There is no saved map yet';
  return null;
}

function set(change: Partial<ZoneEditState>): void {
  useZoneEdit.setState({ ...change, problem: change.problem ?? null });
}

/** Start editing a copy of the robot's zones. Returns why not, or null. */
export function openZoneEditor(): string | null {
  const { robotState, zones } = useRobot.getState();
  const mapName = robotState?.value.currentMap ?? '';
  // Without the robot's current list, Save would replace zones the phone never saw.
  if (!zones || zones.value.mapName !== mapName || !mapName) return "The robot hasn't sent this map's zones yet";
  const draft = zones.value.zones.map((z) => ({ name: z.name, points: Array.from(z.points, (v) => Math.round(v * 100) / 100) }));
  useZoneEdit.setState({ ...closed, open: true, mapName, draft });
  return null;
}

export function closeZoneEditor(): void {
  useZoneEdit.setState(closed);
}

/** Add: the next tap places a square, or a drag draws the rectangle. */
export function startAddingZone(): void {
  set({ adding: true, selected: null });
}

/** A tap on the map at (x, y), metres: places the new zone while adding, else picks the zone there. */
export function tapZones(x: number, y: number): void {
  const s = useZoneEdit.getState();
  if (!s.open || s.saving) return;
  if (s.adding) {
    addBox(boxAround(x, y, NEW_ZONE_SIZE_M));
    return;
  }
  set({ selected: zoneAt(s.draft, x, y) });
}

function addBox(b: Box): void {
  const s = useZoneEdit.getState();
  const zone = { name: nextZoneName(s.draft), points: boxCorners(b) };
  set({ draft: [...s.draft, zone], selected: s.draft.length, adding: false });
}

/** The rectangle dragged on the map, metres: a new zone while adding, else the selected zone's new place. */
export function setZoneBox(b: Box): void {
  const s = useZoneEdit.getState();
  if (!s.open || s.saving) return;
  if (s.adding) {
    // a finger that barely moved is a slip, not a zone
    if (b.x1 - b.x0 >= MIN_ZONE_SIDE_M && b.y1 - b.y0 >= MIN_ZONE_SIDE_M) addBox(b);
    return;
  }
  if (s.selected === null || zoneBox(s.draft[s.selected].points) === null) return;
  const draft = s.draft.slice();
  draft[s.selected] = { ...draft[s.selected], points: boxCorners(b) };
  set({ draft });
}

export function deleteSelectedZone(): void {
  const s = useZoneEdit.getState();
  if (s.selected === null || s.saving) return;
  set({ draft: s.draft.filter((_, i) => i !== s.selected), selected: null, adding: false });
}

/** Has anything changed from the robot's zones? */
export function zonesEdited(): boolean {
  const s = useZoneEdit.getState();
  const robot = useRobot.getState().zones;
  return !robot || !sameZones(s.draft, robot.value.zones);
}

/** Send the zones. On OK the editor closes; otherwise the reason shows and editing goes on. */
export async function saveZones(): Promise<void> {
  const s = useZoneEdit.getState();
  if (!s.open || s.saving) return;
  const problem = zonesProblem(s.draft);
  if (problem) {
    set({ problem });
    return;
  }
  set({ saving: true });
  const outcome = await sendSetNoGoZones(s.mapName, s.draft);
  if (!useZoneEdit.getState().open) return; // closed meanwhile (the map or the mode changed)
  if (!outcome.ok) {
    set({ saving: false, problem: outcome.text || 'the robot gave no reason' });
    return;
  }
  closeZoneEditor();
  const n = s.draft.length;
  showNotice({
    tone: 'success',
    title: 'No-go zones saved',
    text: n === 0 ? 'The map has no no-go zones now.' : `The robot keeps out of ${n === 1 ? 'one zone' : `${n} zones`}.`,
  });
}
