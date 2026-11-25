// The live map: the map as one picture, with the robot, the no-go zones and a trip's route on top. Drag to move,
// pinch to zoom, "Fit" to see the whole map again. Small (in the corner window), it only shows:
// the whole map, no buttons, no touch.
//
// The map changes rarely and comes from the store. The robot's position arrives ten times a
// second; it goes straight into shared values that the drawing reads, so the screen is not
// redrawn by React for each one, and the robot glides from each position to the next over the
// time between two (instead of jumping ten times a second).
//
// Nothing old is shown as current: without a connection the map is greyed, and a position older
// than a second draws the robot in grey ("last seen").
//
// Going to a point: after Go to, a tap places a blue pin (tap again to move it); "Go here" sends it.
// A pin where the robot cannot go is red, with the reason, and cannot be sent. While a trip is
// under way the route and the goal are drawn in blue. The no-go zones are drawn in orange: a
// dashed edge and a light fill.
//
// Cleaning: while choosing what to clean, the robot's preview rows, and the area or spot being
// marked. An area is dragged out with one finger (with none yet: anywhere; then: a corner to
// resize it, its middle to move it; elsewhere the map moves as usual); a tap with no area yet
// places one. A spot is a tap. While a clean runs, the floor cleaned so far as one tinted picture
// under the robot, and the rows still to drive.
//
// No-go zones: "Zones" opens the editor (zones.ts). A tap picks a zone; the picked rectangle is
// dragged like an area (a corner resizes it, its middle moves it); after Add, a tap places a
// square, or a drag draws one.
//
// Rooms: each saved room's name, small and light, at its open spot; no outlines, to keep the map
// clean. "Rooms" opens the editor (rooms.ts): then each room's outline is drawn thin in teal, and a
// tap on a room or its name renames it. The names are hidden while the zones are being changed.
// While the rooms are changed, Join and Split float beside Fit: with Join in hand a tap picks a
// room (it fills light teal; the second one tapped joins the two), with Split in hand two taps set
// the ends of a line (the first shows as a dot) and the room there is split along it.
//
// Exploring: the places still to look at as dashed blue rings, the one the robot is going to as a
// solid ring, and a small key to both at the top left.
//
// A place the robot pointed to in the chat ("Show on map") is drawn like the Go to pin, in its own
// colour, until the map is tapped or for a minute. If it is off the screen, the whole map is shown.
//
// The look is the app's design: unknown ground light grey, the floor white, walls dark; the robot a
// teal disc with a white ring and a soft halo (red in failsafe). The map's tools (Fit, Zones, Rooms) are floating
// white pills at the top left, with the notes and prompts under them.

import {
  AlphaType,
  Canvas,
  Circle,
  ColorType,
  DashPathEffect,
  FilterMode,
  Group,
  Image,
  Line,
  MipmapMode,
  Path,
  Rect,
  Skia,
  type SkImage,
  vec,
} from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import { Easing, type SharedValue, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { showNotice, useActions } from '../robot/actionsStore';
import { placeArea, placeSpot, setArea } from '../robot/cleaning';
import {
  type Box,
  beginEdit,
  continueEdit,
  EDIT_PAN,
  type EditStart,
  mapBoxToPicture,
  pictureBoxToMap,
  screenToPicture,
} from '../robot/cleanArea';
import { mapPrompt } from '../robot/cleanChoice';
import { useChoice, useCleaning } from '../robot/cleaningStore';
import { cleaningControlsFor, previewFading, visibleCleaned, visiblePieces } from '../robot/cleaningView';
import { livePose, POSE_STALE_AFTER_MS } from '../robot/live';
import { angleOnPicture, cellsToRgba, fitView, fromPicture, type MapPlacement, toPicture, zoomAbout } from '../robot/mapPicture';
import { clearMark, useMark } from '../robot/markStore';
import { useRoomEdit } from '../robot/roomEditStore';
import { openRoomEditor, pickRoom, roomToolPrompt, tapRooms, toggleRoomTool } from '../robot/rooms';
import { isFresh, useRobot } from '../robot/store';
import { goToPin, placePin, stopPicking } from '../robot/trip';
import { useTrip } from '../robot/tripStore';
import { useExploring } from '../robot/exploringStore';
import { tripView } from '../robot/tripView';
import { sameData, useWatched } from '../robot/watched';
import { openZoneEditor, setZoneBox, tapZones, useZoneEdit, whyNoZoneEdit, zoneBox } from '../robot/zones';
import { type MapData, type Pose, sameGoal } from '../transport/messages';
import { AreaLayer, CleanedLayer, PlanLayer, SpotLayer } from './CleaningLayers';
import { Icon, type IconName } from './icons';
import { ageText, useNow } from './parts';
import { RoomLabels } from './RoomLabels';
import { colors, floatShadow, radius as radii, spacing } from './theme';

const ROBOT_RADIUS_M = 0.175;
const MIN_ROBOT_RADIUS_PX = 10; // on screen, so the robot stays visible when zoomed out
const MIN_ROBOT_RADIUS_SMALL_PX = 7; // the same in the corner window
const ROBOT_HALO_PX = 5; // on screen: the soft ring around the robot
const ROBOT_HALO_SMALL_PX = 3;
const ROBOT_HALO = 'rgba(11,107,115,0.18)'; // the teal at 18 %
const FAILSAFE_HALO = 'rgba(198,47,42,0.24)'; // in failsafe the robot is red, as in the design
const OLD_ROBOT = '#9aa6a2'; // the robot where it was last seen, when that is no longer current
const OLD_ROBOT_HALO = 'rgba(154,166,162,0.22)';
const MAX_SCALE = 40; // screen pixels per map cell
const PIN_COLOR = colors.info;
const BAD_PIN_COLOR = colors.danger;
const ZONE_FILL = 'rgba(217,72,15,0.16)'; // a no-go zone's light orange fill, as in the design
const ZONE_FILL_PICKED = 'rgba(217,72,15,0.26)'; // the zone being changed: stronger
const ZONE_DASH_PX = 6; // on screen: the zones' dashed edge, dash and gap
const ZONE_GAP_PX = 4;
const GOAL_RADIUS_PX = 8; // on screen
const FRONTIER_RADIUS_PX = 7; // the places still to look at, while exploring: dashed rings
const FRONTIER_DASH_PX = 3;
const FRONTIER_GAP_PX = 2.5;
const EXPLORE_GOAL_RADIUS_PX = 10; // the place the explorer is going to: a ring 22 px across
const EXPLORE_GOAL_FILL = 'rgba(31,111,178,0.14)'; // the exploring blue at 14 %
const MARK_COLOR = colors.mark; // a place the robot pointed to in the chat
const ROOM_EDGE = colors.primary; // the rooms' outlines while they are being changed
const ROOM_PICKED = 'rgba(11,107,115,0.20)'; // the first room picked for a join: the teal at 20 %
const SPLIT_END_PX = 5; // on screen: the first end of a split line, a teal dot ringed in white
const GREYED = 'rgba(242,244,243,0.55)'; // over the map while the connection is lost: the ground, see-through
const NOTE_TEXT = '#3e4a47'; // the design's text in the white notes over the map
const PROMPT_SHADOW = { elevation: 4, shadowColor: colors.text, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } };
const GO_SHADOW = { elevation: 4, shadowColor: colors.info, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } };
// The pin, in screen pixels with its tip on the point: 22 px wide and 34 high, as in the design.
const PIN_SHAPE = 'M0 -1C0 -1 -11 -12.5 -11 -21a11 11 0 0 1 22 0c0 8.5 -11 20 -11 20z';
const PIN_DOT_Y = -21; // the white dot in the pin's head
const MARK_MARGIN_PX = 16; // a mark closer than this to the edge counts as off the screen
const HANDLE_REACH_PX = 28; // on screen: a finger this close to an area's corner takes that corner
const NO_EDIT: EditStart = { kind: EDIT_PAN, ax: 0, ay: 0 };
const GLIDE_MS = 100; // the time between two positions: the robot glides from one to the next
const GLIDE = { duration: GLIDE_MS, easing: Easing.linear };
const JUMP_M = 0.5; // a position farther than this from the last is shown at once (a new map, a relocation)

/** `angle` plus or minus whole turns, to be within half a turn of `from`: the robot turns the short way. */
function nearAngle(angle: number, from: number): number {
  const turn = 2 * Math.PI;
  return angle - turn * Math.round((angle - from) / turn);
}

function makeImage(map: MapData): SkImage | null {
  const data = Skia.Data.fromBytes(cellsToRgba(map));
  return Skia.Image.MakeImage(
    { width: map.width, height: map.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    data,
    map.width * 4,
  );
}

/** Adds a zone's outline (corners x0, y0, x1, y1, ... in metres) to a path on the picture. */
function addPolygon(builder: ReturnType<typeof Skia.PathBuilder.Make>, map: MapPlacement, pts: ArrayLike<number>): void {
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const q = toPicture(map, pts[i], pts[i + 1]);
    if (i === 0) builder.moveTo(q.px, q.py);
    else builder.lineTo(q.px, q.py);
  }
  builder.close();
}

function zonePrompt(adding: boolean, picked: boolean, rectangle: boolean): string {
  if (adding) return 'Tap or drag to place the new zone';
  if (picked && rectangle) return 'Drag a corner to resize it, the middle to move it';
  if (picked) return 'Delete it, or tap another zone';
  return 'Tap a zone to change it';
}

function samePlacement(a: MapPlacement, b: MapPlacement): boolean {
  return a.height === b.height && a.resolution === b.resolution && a.originX === b.originX && a.originY === b.originY && a.originYaw === b.originYaw;
}

/** A pin standing on a point of the picture, the same size on the screen at any zoom. */
function PinMarker({ px, py, color, scale }: { px: number; py: number; color: string; scale: SharedValue<number> }) {
  const transform = useDerivedValue(() => [{ translateX: px }, { translateY: py }, { scale: 1 / scale.value }], [px, py]);
  return (
    <Group transform={transform}>
      <Path path={PIN_SHAPE} color={color} />
      <Path path={PIN_SHAPE} color="#ffffff" style="stroke" strokeWidth={2} strokeJoin="round" />
      <Circle cx={0} cy={PIN_DOT_Y} r={4} color="#ffffff" />
    </Group>
  );
}

/** One of the map's tools: a floating white pill with an icon and a word. */
function MapTool({
  icon,
  label,
  onPress,
  accessibilityLabel,
  blocked = false,
  inHand = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  blocked?: boolean;
  inHand?: boolean; // the tool is the one in use: teal, and a tap puts it away
}) {
  const tint = blocked ? colors.faint : inHand ? '#ffffff' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: inHand, disabled: blocked }}
      onPress={onPress}
      style={({ pressed }) => [styles.tool, inHand && styles.toolInHand, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={tint} strokeWidth={1.9} />
      <Text style={[styles.toolText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

/** While exploring: what the blue rings on the map mean. */
function ExploringKey() {
  return (
    <View style={[styles.note, styles.key]}>
      <View style={styles.keyLine}>
        <Svg width={22} height={16} accessible={false}>
          <SvgCircle cx={11} cy={8} r={6} fill="none" stroke={colors.explore} strokeWidth={2} strokeDasharray="3 2.5" />
        </Svg>
        <Text style={styles.keyText}>Not explored yet</Text>
      </View>
      <View style={styles.keyLine}>
        <View style={styles.keyGoal} />
        <Text style={styles.keyText}>Going here next</Text>
      </View>
    </View>
  );
}

/** What the map draws from the robot's state, its cleaning status, the newest trip and the time. */
function shownNow() {
  const now = Date.now();
  const { connection, robotState, navigation } = useRobot.getState();
  const cleaning = useCleaning.getState().status;
  const connected = connection.kind === 'connected';
  const state = robotState?.value ?? null;
  const robotLive = connected && isFresh(robotState, now);
  const job = cleaning?.value ?? null;
  return {
    robotLive,
    running: cleaningControlsFor(state, robotLive, connected, job, connected && isFresh(cleaning, now)).running,
    jobId: job?.jobId ?? null,
    jobState: job?.state ?? null,
    piece: job?.piece ?? null,
    tripActive: tripView(navigation, state?.state ?? '', now).active,
    tripGoal: navigation ? navigation.value.goalId.join() : '',
    poseLive: connected && livePose.at > 0 && now - livePose.at < POSE_STALE_AFTER_MS,
    robotKnown: livePose.at > 0,
  };
}

/** How long ago the robot's position last came: counts up by itself while it is shown. */
function LastSeen() {
  const now = useNow(500);
  return <Text style={styles.labelText}>Robot last seen {ageText(now - livePose.at)}</Text>;
}

export function MapView({ small = false }: { small?: boolean }) {
  // The robot's messages come several times a second; the map is drawn again only when something
  // it shows has changed.
  const shown = useWatched(shownNow, sameData);
  const connected = useRobot((s) => s.connection.kind === 'connected');
  const mapEntry = useRobot((s) => s.map);
  const currentMap = useRobot((s) => s.robotState?.value.currentMap ?? '');
  const mode = useRobot((s) => s.robotState?.value.state ?? '');
  const makingMap = useRobot((s) => {
    const st = s.robotState?.value;
    return st ? st.makingMap || st.state === 'mapping' || st.state === 'exploring' : false;
  });
  const frontiers = useExploring((s) => s.frontiers);
  const route = useRobot((s) => s.route);
  const zones = useRobot((s) => s.zones);
  const { picking, pin, goal } = useTrip();
  const busy = useActions((s) => s.busy);
  const cleaningPlan = useCleaning((s) => s.plan);
  const cleanedEntry = useCleaning((s) => s.cleaned);
  const choice = useChoice();
  const zoneEdit = useZoneEdit();
  const roomEdit = useRoomEdit();
  const robotRooms = useRobot((s) => s.rooms);
  const mark = useMark((s) => s.mark);
  const map = mapEntry?.value ?? null;
  const image = useMemo(() => (map ? makeImage(map) : null), [map]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // screen = picture * scale + (tx, ty)
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const minScale = useSharedValue(0.05);
  // Moved or zoomed by a finger since the last fit: then a change of the view's size (a panel
  // opening below it) keeps the user's view instead of fitting the map again.
  const moved = useSharedValue(false);
  const fittedFor = useRef({ width: 0, height: 0 });
  // The robot on the picture (cells; the angle in radians), and where it was last sent.
  const robotX = useSharedValue(-1e5);
  const robotY = useSharedValue(-1e5);
  const robotAngle = useSharedValue(0);
  const robotTarget = useRef<{ x: number; y: number; angle: number } | null>(null);
  // The area being marked, on the picture. It follows the finger on the UI thread; the choice
  // gets it (in metres) when the finger lifts, and the robot's preview follows.
  const areaPic = useSharedValue<Box | null>(null);
  const areaMode = useSharedValue(false);
  const edit = useSharedValue<EditStart>(NO_EDIT);
  const edited = useSharedValue(false);
  const placement = useRef<MapPlacement | null>(null);
  // After a swap between small and large, fit the map once the view has its new size.
  const fitPending = useRef(false);
  const sizeAtSwap = useRef({ width: 0, height: 0 });
  const wasSmall = useRef(small);

  function fit() {
    if (!map || size.width === 0) return;
    const v = fitView(map.width, map.height, size.width, size.height);
    scale.value = v.scale;
    tx.value = v.tx;
    ty.value = v.ty;
    minScale.value = v.scale * 0.5;
    moved.value = false;
    fittedFor.current = size;
  }

  if (wasSmall.current !== small) {
    wasSmall.current = small;
    fitPending.current = true;
    sizeAtSwap.current = size;
  }

  // Fit the first map, the map after a swap, and the map when the view changes size (a panel opens
  // or closes below it, the phone turns) unless a finger has moved it since. Small, it always shows
  // the whole map. When the map grows or moves (while mapping), keep the same place on the ground
  // under the same place on the screen instead of jumping.
  useEffect(() => {
    if (!map || size.width === 0) return;
    const before = placement.current;
    const newSize = size.width !== sizeAtSwap.current.width || size.height !== sizeAtSwap.current.height;
    const resized = size.width !== fittedFor.current.width || size.height !== fittedFor.current.height;
    if (before === null || before.resolution !== map.resolution || small || fitPending.current || (resized && !moved.value)) {
      fit();
      if (newSize) fitPending.current = false;
    } else if (!samePlacement(before, map)) {
      const a = toPicture(before, 0, 0);
      const b = toPicture(map, 0, 0);
      tx.value += (a.px - b.px) * scale.value;
      ty.value += (a.py - b.py) * scale.value;
    }
    placement.current = map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, size.width, size.height, small]);

  // The position, placed on the current map: gliding there from the last one, unless it is the
  // first, or far away (a new map), which are shown at once.
  useEffect(() => {
    if (!map) return;
    robotTarget.current = null;
    const jump = JUMP_M / map.resolution;
    const showPose = (p: Pose) => {
      const q = toPicture(map, p.x, p.y);
      const last = robotTarget.current;
      const angle = nearAngle(angleOnPicture(map, p.heading), last?.angle ?? 0);
      robotTarget.current = { x: q.px, y: q.py, angle };
      if (last === null || Math.hypot(q.px - last.x, q.py - last.y) > jump) {
        robotX.value = q.px;
        robotY.value = q.py;
        robotAngle.value = angle;
      } else {
        robotX.value = withTiming(q.px, GLIDE);
        robotY.value = withTiming(q.py, GLIDE);
        robotAngle.value = withTiming(angle, GLIDE);
      }
    };
    if (livePose.value) showPose(livePose.value);
    return livePose.subscribe(showPose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Cleaning: choosing (the preview, the area or spot being marked) or a clean under way.
  const { robotLive, running } = shown;
  const choosing = choice.open && !running && !small;
  const marking = choosing && (choice.kind === 'area' || choice.kind === 'spot') ? choice.kind : null;
  const editingZones = zoneEdit.open && !small;
  const editingRooms = roomEdit.open && !small;
  const pickedZone = editingZones && zoneEdit.selected !== null ? (zoneEdit.draft[zoneEdit.selected] ?? null) : null;
  const pickedBox = pickedZone ? zoneBox(pickedZone.points) : null;
  // A rectangle follows the finger: the area being marked, the zone picked, or the zone being added.
  const boxEditing = marking === 'area' || (editingZones && (zoneEdit.adding || pickedBox !== null));
  // The status as it is now: `shown` has asked for this redraw if a part drawn here has changed.
  const status = shown.jobId === null ? null : (useCleaning.getState().status?.value ?? null);
  // Worked out again only when what is shown changes (the status comes five times a second, but
  // the rows still to drive change once a row): the rows' drawing is then kept as it is.
  const piecesFrom = status?.state === 'starting' ? 0 : (status?.piece ?? 0);
  const pieces = useMemo(
    () => visiblePieces(choosing, choice.preview, cleaningPlan, status, running),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choosing, choice.preview, cleaningPlan, running, status?.jobId, status?.state, piecesFrom],
  );
  const fading = previewFading(choosing, choice.preview, cleaningPlan);
  const cleaned = visibleCleaned(cleanedEntry, status, running);

  useEffect(() => {
    areaMode.value = boxEditing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxEditing]);
  // Only when what is edited changes (not at every redraw): a redraw during a drag must not put
  // the rectangle back where it was.
  useEffect(() => {
    if (editingZones) {
      const z = zoneEdit.selected !== null && !zoneEdit.adding ? zoneEdit.draft[zoneEdit.selected] : undefined;
      const b = z ? zoneBox(z.points) : null;
      areaPic.value = map && b ? mapBoxToPicture(map, b) : null;
    } else {
      areaPic.value = map && choice.area ? mapBoxToPicture(map, choice.area) : null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, choice.area, editingZones, zoneEdit.draft, zoneEdit.selected, zoneEdit.adding]);
  const mapRef = useRef(map);
  mapRef.current = map;
  // The finger has lifted after changing the rectangle: the zone or the choice gets it in metres.
  const commitArea = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const m = mapRef.current;
    if (!m) return;
    const box = pictureBoxToMap(m, { x0, y0, x1, y1 });
    if (useZoneEdit.getState().open) setZoneBox(box);
    else setArea(box);
  }, []);

  const robotRadius = map ? ROBOT_RADIUS_M / map.resolution : 1;
  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);
  const minRobotPx = small ? MIN_ROBOT_RADIUS_SMALL_PX : MIN_ROBOT_RADIUS_PX;
  const haloPx = small ? ROBOT_HALO_SMALL_PX : ROBOT_HALO_PX;
  const radius = useDerivedValue(() => Math.max(robotRadius, minRobotPx / scale.value));
  const outline = useDerivedValue(() => 2 / scale.value);
  const zoneLine = useDerivedValue(() => 4 / scale.value);
  const routeWidth = useDerivedValue(() => 3 / scale.value);
  const markerRadius = useDerivedValue(() => GOAL_RADIUS_PX / scale.value);
  const markerHole = useDerivedValue(() => (GOAL_RADIUS_PX * 0.45) / scale.value);
  const frontierRadius = useDerivedValue(() => FRONTIER_RADIUS_PX / scale.value);
  const frontierDash = useDerivedValue(() => [FRONTIER_DASH_PX / scale.value, FRONTIER_GAP_PX / scale.value]);
  const exploreGoalRadius = useDerivedValue(() => EXPLORE_GOAL_RADIUS_PX / scale.value);
  const zoneDash = useDerivedValue(() => [ZONE_DASH_PX / scale.value, ZONE_GAP_PX / scale.value]);
  const halo = useDerivedValue(() => radius.value + haloPx / scale.value);
  const centre = useDerivedValue(() => vec(robotX.value, robotY.value));
  // The heading: a short white stroke inside the disc, from near the middle towards the front.
  const tail = useDerivedValue(() =>
    vec(robotX.value + 0.2 * radius.value * Math.cos(robotAngle.value), robotY.value + 0.2 * radius.value * Math.sin(robotAngle.value)),
  );
  const nose = useDerivedValue(() =>
    vec(robotX.value + 0.7 * radius.value * Math.cos(robotAngle.value), robotY.value + 0.7 * radius.value * Math.sin(robotAngle.value)),
  );

  // One finger moves the map, except while an area is being marked: then, depending on where the
  // finger lands, it draws the area, drags a corner, or moves the area (cleanArea.ts).
  const pan = usePanGesture({
    onBegin: (e) => {
      'worklet';
      edited.value = false;
      if (!areaMode.value || e.numberOfPointers > 1) {
        edit.value = NO_EDIT;
        return;
      }
      const p = screenToPicture({ scale: scale.value, tx: tx.value, ty: ty.value }, e.x, e.y);
      edit.value = beginEdit(areaPic.value, p.px, p.py, HANDLE_REACH_PX / scale.value);
    },
    onUpdate: (e) => {
      'worklet';
      if (edit.value.kind === EDIT_PAN || e.numberOfPointers > 1) {
        tx.value += e.changeX;
        ty.value += e.changeY;
        moved.value = true;
        return;
      }
      const p = screenToPicture({ scale: scale.value, tx: tx.value, ty: ty.value }, e.x, e.y);
      areaPic.value = continueEdit(areaPic.value, edit.value, p.px, p.py, e.changeX / scale.value, e.changeY / scale.value);
      edited.value = true;
    },
    onFinalize: () => {
      'worklet';
      const b = areaPic.value;
      if (edited.value && b !== null) scheduleOnRN(commitArea, b.x0, b.y0, b.x1, b.y1);
      edited.value = false;
      edit.value = NO_EDIT;
    },
  });
  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      const v = zoomAbout({ scale: scale.value, tx: tx.value, ty: ty.value }, e.scaleChange, e.focalX, e.focalY, minScale.value, MAX_SCALE);
      scale.value = v.scale;
      tx.value = v.tx;
      ty.value = v.ty;
      moved.value = true;
    },
  });
  // A tap while picking places the pin; while marking a spot, the spot; while marking an area with
  // none yet, an area around it. It runs on the JavaScript side: it changes app state, and reads
  // the view's current scale and position to turn the screen point into map coordinates.
  const tap = useTapGesture({
    runOnJS: true,
    onActivate: (e) => {
      if (!map) return;
      const px = (e.x - tx.value) / scale.value;
      const py = (e.y - ty.value) / scale.value;
      const p = fromPicture(map, px, py);
      clearMark(); // a tap elsewhere: the place shown from the chat has been seen
      if (useRoomEdit.getState().open) void tapRooms(p.x, p.y);
      else if (useZoneEdit.getState().open) tapZones(p.x, p.y);
      else if (useTrip.getState().picking) placePin(p.x, p.y);
      else if (marking === 'spot') placeSpot(p.x, p.y);
      else if (marking === 'area') placeArea(p.x, p.y);
    },
  });
  const gestures = useSimultaneousGestures(pan, pinch, tap);

  // The trip: the route Nav2 planned and the goal, while a trip is under way.
  const trip = { active: shown.tripActive };
  // The trip as it is now: `shown` has asked for this redraw if it started, ended or got another goal.
  const navigation = shown.tripActive ? useRobot.getState().navigation : null;
  const routePath = useMemo(() => {
    if (!map || !route || !trip.active || route.value.points.length < 4) return null;
    const builder = Skia.PathBuilder.Make();
    const pts = route.value.points;
    for (let i = 0; i < pts.length; i += 2) {
      const q = toPicture(map, pts[i], pts[i + 1]);
      if (i === 0) builder.moveTo(q.px, q.py);
      else builder.lineTo(q.px, q.py);
    }
    return builder.build();
  }, [map, route, trip.active]);
  let goalAt: { x: number; y: number } | null = null;
  if (trip.active && navigation) {
    if (goal && sameGoal(goal.id, navigation.value.goalId)) goalAt = goal;
    else if (route && route.value.points.length >= 2) {
      const pts = route.value.points; // someone else's goal: the route's end is where it is going
      goalAt = { x: pts[pts.length - 2], y: pts[pts.length - 1] };
    }
  }
  const goalPic = map && goalAt ? toPicture(map, goalAt.x, goalAt.y) : null;

  // The no-go zones, as one path on the picture: the robot's, or while editing, the edited ones
  // (the picked rectangle is drawn by itself, where the finger has it). A picked zone of another
  // shape is outlined.
  const zonePath = useMemo(() => {
    const shown = editingZones ? zoneEdit.draft.filter((_, i) => i !== zoneEdit.selected || pickedBox === null) : (zones?.value.zones ?? []);
    if (!map || shown.length === 0) return null;
    const builder = Skia.PathBuilder.Make();
    for (const zone of shown) addPolygon(builder, map, zone.points);
    return builder.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zones, editingZones, zoneEdit.draft, zoneEdit.selected]);
  const pickedPath = useMemo(() => {
    if (!map || !pickedZone || pickedBox !== null) return null;
    const builder = Skia.PathBuilder.Make();
    addPolygon(builder, map, pickedZone.points);
    return builder.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pickedZone]);
  const zoneEditBlocked = whyNoZoneEdit(mode, currentMap, robotLive, makingMap);
  // While exploring: the places still to look at, as dashed rings.
  const frontierPics = map && mode === 'exploring' && frontiers ? frontiers.value.points.map((p) => toPicture(map, p.x, p.y)) : [];
  function editZones() {
    const why = zoneEditBlocked ?? openZoneEditor();
    if (why) showNotice({ tone: 'info', title: "Can't change the no-go zones now", text: why });
  }
  // The rooms are changed under the same rule as the zones: they belong to the map in use.
  function editRooms() {
    const why = zoneEditBlocked ?? openRoomEditor();
    if (why) showNotice({ tone: 'info', title: "Can't change the rooms now", text: why });
  }

  // The rooms: while being changed, the edited ones with their outlines; otherwise the robot's
  // names only, for the saved map in use (not over a map being made, nor while zones are changed).
  const labelledRooms = editingRooms
    ? roomEdit.draft
    : !small && !editingZones && !makingMap && robotRooms && robotRooms.value.mapName === currentMap
      ? robotRooms.value.rooms
      : [];
  const roomLine = useDerivedValue(() => 1.5 / scale.value);
  const roomPath = useMemo(() => {
    if (!map || !editingRooms || roomEdit.draft.length === 0) return null;
    const builder = Skia.PathBuilder.Make();
    for (const room of roomEdit.draft) if (room.points.length >= 6) addPolygon(builder, map, room.points);
    return builder.build();
  }, [map, editingRooms, roomEdit.draft]);
  // Join: the first room picked. Split: the first end of the line.
  const roomPicked = editingRooms && roomEdit.picked !== null ? (roomEdit.draft[roomEdit.picked] ?? null) : null;
  const roomPickedPath = useMemo(() => {
    if (!map || !roomPicked || roomPicked.points.length < 6) return null;
    const builder = Skia.PathBuilder.Make();
    addPolygon(builder, map, roomPicked.points);
    return builder.build();
  }, [map, roomPicked]);
  const splitFrom = map && editingRooms && roomEdit.from ? toPicture(map, roomEdit.from.x, roomEdit.from.y) : null;
  const splitEnd = useDerivedValue(() => SPLIT_END_PX / scale.value);
  const splitRing = useDerivedValue(() => (SPLIT_END_PX + 2) / scale.value);

  // A place shown from the chat. Off the screen (the map was moved or zoomed), the whole map.
  const markPic = map && mark && !small ? toPicture(map, mark.x, mark.y) : null;
  useEffect(() => {
    if (!markPic || size.width === 0) return;
    const sx = markPic.px * scale.value + tx.value;
    const sy = markPic.py * scale.value + ty.value;
    const m = MARK_MARGIN_PX;
    if (sx < m || sy < m || sx > size.width - m || sy > size.height - m) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark?.id, small, size.width, size.height]);

  const pinPic = map && picking && pin ? toPicture(map, pin.x, pin.y) : null;
  const pinProblem = picking && pin ? pin.problem : null;
  const canGo = pin !== null && pinProblem === null && busy === null && connected;

  const { poseLive, robotKnown } = shown;
  const label = mode === 'exploring' ? 'Exploring: making a new map' : makingMap ? 'Making a new map' : currentMap ? `Map: ${currentMap}` : '';

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }

  if (!map || !image) {
    return (
      <View style={[styles.area, styles.empty]} onLayout={onLayout}>
        <Text style={[styles.emptyText, small && styles.emptySmall]}>{connected ? (small ? 'No map yet' : 'No map yet. Waiting for the robot…') : 'No map'}</Text>
      </View>
    );
  }

  const exploring = mode === 'exploring';
  const canvas = (
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={transform}>
              <Image
                image={image}
                x={0}
                y={0}
                width={map.width}
                height={map.height}
                fit="fill"
                sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
              />
              {cleaned ? <CleanedLayer map={map} cleaned={cleaned} /> : null}
              {zonePath ? (
                <Group>
                  <Path path={zonePath} color={ZONE_FILL} />
                  <Path path={zonePath} style="stroke" strokeWidth={outline} color={colors.zone}>
                    <DashPathEffect intervals={zoneDash} />
                  </Path>
                </Group>
              ) : null}
              {roomPickedPath ? <Path path={roomPickedPath} color={ROOM_PICKED} /> : null}
              {roomPath ? <Path path={roomPath} style="stroke" strokeWidth={roomLine} color={ROOM_EDGE} strokeJoin="round" /> : null}
              {splitFrom ? (
                <Group>
                  <Circle cx={splitFrom.px} cy={splitFrom.py} r={splitRing} color="#ffffff" />
                  <Circle cx={splitFrom.px} cy={splitFrom.py} r={splitEnd} color={ROOM_EDGE} />
                </Group>
              ) : null}
              <PlanLayer map={map} pieces={pieces} scale={scale} faded={fading} />
              {pickedPath ? <Path path={pickedPath} style="stroke" strokeWidth={zoneLine} color={colors.zone} /> : null}
              {marking === 'area' ? <AreaLayer area={areaPic} scale={scale} /> : null}
              {editingZones ? <AreaLayer area={areaPic} scale={scale} fill={ZONE_FILL_PICKED} edge={colors.zone} /> : null}
              {marking === 'spot' && choice.spot ? <SpotLayer map={map} spot={choice.spot} scale={scale} /> : null}
              {frontierPics.map((q, i) => (
                <Circle key={`f${i}`} cx={q.px} cy={q.py} r={frontierRadius} color={colors.explore} style="stroke" strokeWidth={outline}>
                  <DashPathEffect intervals={frontierDash} />
                </Circle>
              ))}
              {routePath ? (
                <Path
                  path={routePath}
                  style="stroke"
                  strokeWidth={routeWidth}
                  color={exploring ? colors.explore : colors.info}
                  opacity={0.8}
                  strokeJoin="round"
                  strokeCap="round"
                />
              ) : null}
              {goalPic && exploring ? (
                <Group>
                  <Circle cx={goalPic.px} cy={goalPic.py} r={exploreGoalRadius} color={EXPLORE_GOAL_FILL} />
                  <Circle cx={goalPic.px} cy={goalPic.py} r={exploreGoalRadius} color={colors.explore} style="stroke" strokeWidth={outline} />
                </Group>
              ) : goalPic ? (
                <Group>
                  <Circle cx={goalPic.px} cy={goalPic.py} r={markerRadius} color={colors.info} />
                  <Circle cx={goalPic.px} cy={goalPic.py} r={markerHole} color="#ffffff" />
                </Group>
              ) : null}
              {pinPic ? <PinMarker px={pinPic.px} py={pinPic.py} color={pinProblem ? BAD_PIN_COLOR : PIN_COLOR} scale={scale} /> : null}
              {markPic ? <PinMarker px={markPic.px} py={markPic.py} color={MARK_COLOR} scale={scale} /> : null}
              {robotKnown ? (
                <Group>
                  <Circle c={centre} r={halo} color={!poseLive ? OLD_ROBOT_HALO : mode === 'failsafe' ? FAILSAFE_HALO : ROBOT_HALO} />
                  <Circle c={centre} r={radius} color={!poseLive ? OLD_ROBOT : mode === 'failsafe' ? colors.danger : colors.primary} />
                  <Circle c={centre} r={radius} color="#ffffff" style="stroke" strokeWidth={outline} />
                  <Line p1={tail} p2={nose} color="#ffffff" strokeWidth={outline} strokeCap="round" />
                </Group>
              ) : null}
            </Group>
            {!connected ? <Rect x={0} y={0} width={size.width} height={size.height} color={GREYED} /> : null}
          </Canvas>
  );

  if (small) {
    return (
      <View style={styles.area} onLayout={onLayout} pointerEvents="none">
        {canvas}
      </View>
    );
  }

  const roomsChosen = choosing && choice.kind === 'room' ? choice.roomName : null;
  const cleanPrompt = choosing ? mapPrompt(choice) : null;
  return (
    <View style={styles.area} onLayout={onLayout}>
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill}>{canvas}</View>
      </GestureDetector>
      {labelledRooms.length > 0 ? (
        <RoomLabels
          rooms={labelledRooms}
          map={map}
          view={{ scale, tx, ty }}
          chosen={roomsChosen}
          onPress={editingRooms && roomEdit.work === null && roomEdit.tool !== 'split' ? (i) => void pickRoom(i) : undefined}
        />
      ) : null}

      {/* The tools in a row at the top left (Zones and Rooms only for the saved map in use), and
          under them the note or prompt of the moment. */}
      <View style={styles.topLeft} pointerEvents="box-none">
        <View style={styles.tools} pointerEvents="box-none">
          <MapTool icon="fit" label="Fit" onPress={fit} />
          {currentMap && connected && !picking && !choosing && !editingZones && !editingRooms && !makingMap ? (
            <>
              <MapTool icon="zones" label="Zones" accessibilityLabel="Change the no-go zones" onPress={editZones} blocked={zoneEditBlocked !== null} />
              <MapTool icon="rooms" label="Rooms" accessibilityLabel="Change the rooms" onPress={editRooms} blocked={zoneEditBlocked !== null} />
            </>
          ) : null}
          {editingRooms && connected ? (
            <>
              <MapTool
                icon="join"
                label="Join"
                accessibilityLabel="Join two rooms into one"
                onPress={() => toggleRoomTool('join')}
                blocked={roomEdit.work !== null || roomEdit.draft.length < 2}
                inHand={roomEdit.tool === 'join'}
              />
              <MapTool
                icon="split"
                label="Split"
                accessibilityLabel="Split a room in two"
                onPress={() => toggleRoomTool('split')}
                blocked={roomEdit.work !== null || roomEdit.draft.length < 1}
                inHand={roomEdit.tool === 'split'}
              />
            </>
          ) : null}
        </View>
        {picking ? (
          <View style={[styles.prompt, pinProblem ? styles.badPrompt : null]}>
            <Text style={styles.promptText}>
              {pinProblem ? `Can't go there: ${pinProblem.charAt(0).toLowerCase()}${pinProblem.slice(1)}` : pin ? 'Tap again to move the pin' : 'Tap where the robot should go'}
            </Text>
          </View>
        ) : editingZones ? (
          <View style={[styles.note, styles.noteRow]}>
            <View style={styles.zoneSwatch} />
            <Text style={styles.noteText}>{zonePrompt(zoneEdit.adding, pickedZone !== null, pickedBox !== null)}</Text>
          </View>
        ) : editingRooms ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>
              {roomEdit.work !== null
                ? 'Wait for the robot…'
                : (roomToolPrompt(roomEdit) ?? (roomEdit.draft.length > 0 ? 'Tap a room to rename it' : 'Find rooms to split the map'))}
            </Text>
          </View>
        ) : cleanPrompt ? (
          <View style={styles.prompt}>
            <Text style={styles.promptText}>{cleanPrompt}</Text>
          </View>
        ) : label ? (
          <View style={styles.label}>
            <Text style={styles.labelText}>{label}</Text>
          </View>
        ) : null}
        {picking ? null : !connected ? (
          <View style={styles.label}>
            <Text style={styles.labelText}>Connection lost: the map as it was</Text>
          </View>
        ) : robotKnown && !poseLive ? (
          <View style={styles.label}>
            <LastSeen />
          </View>
        ) : null}
        {exploring && !picking ? <ExploringKey /> : null}
      </View>
      {picking ? (
        <View style={styles.pickBar}>
          <Pressable accessibilityRole="button" onPress={stopPicking} style={[styles.pickButton, styles.pickCancel]}>
            <Text style={styles.pickCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={goToPin}
            disabled={!canGo}
            style={[styles.pickButton, styles.pickGo, !canGo && styles.pickGoDisabled]}
          >
            <Text style={styles.pickGoText}>{busy === 'goto' ? 'Starting…' : 'Go here'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, backgroundColor: colors.mapUnknown, overflow: 'hidden' },
  empty: { justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, color: colors.muted },
  emptySmall: { fontSize: 12 },
  // One column at the top left: the tools' row (it wraps at a large text size), then the notes.
  topLeft: { position: 'absolute', top: spacing.m, left: spacing.m, right: spacing.m, alignItems: 'flex-start', gap: spacing.s },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  tool: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.float,
    ...floatShadow,
  },
  toolInHand: { backgroundColor: colors.primary },
  toolText: { fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  // What the map shows now ("Map: home"), and how current it is: a small white pill.
  label: { backgroundColor: colors.float, borderRadius: radii.pill, paddingHorizontal: spacing.m, paddingVertical: 6, ...floatShadow },
  labelText: { fontSize: 13, fontWeight: '500', color: colors.text },
  // "Tap the map" prompts: a dark pill; red when the pin is somewhere the robot cannot go.
  prompt: { backgroundColor: colors.text, borderRadius: 22, paddingHorizontal: spacing.l, paddingVertical: 10, ...PROMPT_SHADOW },
  badPrompt: { backgroundColor: colors.danger },
  promptText: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  // Notes while the zones or the rooms are being changed, and the exploring key: a white card.
  note: { backgroundColor: colors.float, borderRadius: radii.m, paddingHorizontal: spacing.m, paddingVertical: spacing.s, ...floatShadow },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  noteText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: NOTE_TEXT },
  zoneSwatch: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.zone, backgroundColor: ZONE_FILL },
  key: { gap: 6 },
  keyLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  keyGoal: { width: 12, height: 12, marginHorizontal: 5, borderRadius: 6, borderWidth: 2, borderColor: colors.explore, backgroundColor: EXPLORE_GOAL_FILL },
  keyText: { fontSize: 12, fontWeight: '600', color: NOTE_TEXT },
  pickBar: { position: 'absolute', left: spacing.m, right: spacing.m, bottom: spacing.m, flexDirection: 'row', gap: spacing.m },
  pickButton: { flex: 1, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  pickCancel: { backgroundColor: colors.float, ...floatShadow },
  pickCancelText: { fontSize: 15, fontWeight: '600', color: colors.text },
  pickGo: { backgroundColor: PIN_COLOR, ...GO_SHADOW },
  pickGoDisabled: { opacity: 0.45 },
  pickGoText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});
