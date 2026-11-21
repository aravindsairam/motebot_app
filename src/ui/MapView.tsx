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
// Going to a point: after Go to, a tap places a pin (tap again to move it); "Go here" sends it.
// A pin where the robot cannot go is red, with the reason, and cannot be sent. While a trip is
// under way the route and the goal are drawn. The no-go zones are drawn in red.
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

import {
  AlphaType,
  Canvas,
  Circle,
  ColorType,
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
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
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
import { isFresh, useRobot } from '../robot/store';
import { goToPin, placePin, stopPicking } from '../robot/trip';
import { useTrip } from '../robot/tripStore';
import { useExploring } from '../robot/exploringStore';
import { tripView } from '../robot/tripView';
import { openZoneEditor, setZoneBox, tapZones, useZoneEdit, whyNoZoneEdit, zoneBox } from '../robot/zones';
import { type MapData, type Pose, sameGoal } from '../transport/messages';
import { AreaLayer, CleanedLayer, PlanLayer, SpotLayer } from './CleaningLayers';
import { ageText, useNow } from './parts';
import { colors, spacing } from './theme';

const ROBOT_RADIUS_M = 0.175;
const MIN_ROBOT_RADIUS_PX = 7; // on screen, so the robot stays visible when zoomed out
const MAX_SCALE = 40; // screen pixels per map cell
const PIN_COLOR = '#ea580c';
const BAD_PIN_COLOR = colors.danger;
const ZONE_FILL = 'rgba(220,38,38,0.16)';
const ZONE_EDGE = 'rgba(220,38,38,0.85)';
const GOAL_RADIUS_PX = 8; // on screen
const FRONTIER_RADIUS_PX = 5; // the places still to look at, while exploring
const FRONTIER_COLOR = '#f59e0b';
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

export function MapView({ small = false }: { small?: boolean }) {
  const now = useNow(500);
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
  const navigation = useRobot((s) => s.navigation);
  const zones = useRobot((s) => s.zones);
  const { picking, pin, goal } = useTrip();
  const busy = useActions((s) => s.busy);
  const robotState = useRobot((s) => s.robotState);
  const cleaningStatus = useCleaning((s) => s.status);
  const cleaningPlan = useCleaning((s) => s.plan);
  const cleanedEntry = useCleaning((s) => s.cleaned);
  const choice = useChoice();
  const zoneEdit = useZoneEdit();
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
  const robotLive = connected && isFresh(robotState, now);
  const statusLive = connected && isFresh(cleaningStatus, now);
  const { running } = cleaningControlsFor(robotState?.value ?? null, robotLive, connected, cleaningStatus?.value ?? null, statusLive);
  const choosing = choice.open && !running && !small;
  const marking = choosing && (choice.kind === 'area' || choice.kind === 'spot') ? choice.kind : null;
  const editingZones = zoneEdit.open && !small;
  const pickedZone = editingZones && zoneEdit.selected !== null ? (zoneEdit.draft[zoneEdit.selected] ?? null) : null;
  const pickedBox = pickedZone ? zoneBox(pickedZone.points) : null;
  // A rectangle follows the finger: the area being marked, the zone picked, or the zone being added.
  const boxEditing = marking === 'area' || (editingZones && (zoneEdit.adding || pickedBox !== null));
  const status = cleaningStatus?.value ?? null;
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
  const radius = useDerivedValue(() => Math.max(robotRadius, MIN_ROBOT_RADIUS_PX / scale.value));
  const outline = useDerivedValue(() => 2 / scale.value);
  const zoneLine = useDerivedValue(() => 4 / scale.value);
  const routeWidth = useDerivedValue(() => 3 / scale.value);
  const markerRadius = useDerivedValue(() => GOAL_RADIUS_PX / scale.value);
  const markerHole = useDerivedValue(() => (GOAL_RADIUS_PX * 0.45) / scale.value);
  const frontierRadius = useDerivedValue(() => FRONTIER_RADIUS_PX / scale.value);
  const centre = useDerivedValue(() => vec(robotX.value, robotY.value));
  const nose = useDerivedValue(() =>
    vec(robotX.value + radius.value * Math.cos(robotAngle.value), robotY.value + radius.value * Math.sin(robotAngle.value)),
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
      if (useZoneEdit.getState().open) tapZones(p.x, p.y);
      else if (useTrip.getState().picking) placePin(p.x, p.y);
      else if (marking === 'spot') placeSpot(p.x, p.y);
      else if (marking === 'area') placeArea(p.x, p.y);
    },
  });
  const gestures = useSimultaneousGestures(pan, pinch, tap);

  // The trip: the route Nav2 planned and the goal, while a trip is under way.
  const trip = tripView(navigation, mode, now);
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
  // While exploring: the places still to look at, as dots.
  const frontierPics = map && mode === 'exploring' && frontiers ? frontiers.value.points.map((p) => toPicture(map, p.x, p.y)) : [];
  function editZones() {
    const why = zoneEditBlocked ?? openZoneEditor();
    if (why) showNotice({ tone: 'info', title: "Can't change the no-go zones now", text: why });
  }
  const pinPic = map && picking && pin ? toPicture(map, pin.x, pin.y) : null;
  const pinProblem = picking && pin ? pin.problem : null;
  const canGo = pin !== null && pinProblem === null && busy === null && connected;

  const poseLive = connected && livePose.at > 0 && now - livePose.at < POSE_STALE_AFTER_MS;
  const robotKnown = livePose.at > 0;
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
                  <Path path={zonePath} style="stroke" strokeWidth={outline} color={ZONE_EDGE} />
                </Group>
              ) : null}
              <PlanLayer map={map} pieces={pieces} scale={scale} faded={fading} />
              {pickedPath ? <Path path={pickedPath} style="stroke" strokeWidth={zoneLine} color={ZONE_EDGE} /> : null}
              {marking === 'area' ? <AreaLayer area={areaPic} scale={scale} /> : null}
              {editingZones ? <AreaLayer area={areaPic} scale={scale} fill={ZONE_FILL} edge={ZONE_EDGE} /> : null}
              {marking === 'spot' && choice.spot ? <SpotLayer map={map} spot={choice.spot} scale={scale} /> : null}
              {frontierPics.map((q, i) => (
                <Circle key={`f${i}`} cx={q.px} cy={q.py} r={frontierRadius} color={FRONTIER_COLOR} opacity={0.85} />
              ))}
              {routePath ? (
                <Path path={routePath} style="stroke" strokeWidth={routeWidth} color={colors.primary} opacity={0.8} strokeJoin="round" strokeCap="round" />
              ) : null}
              {goalPic ? (
                <Group>
                  <Circle cx={goalPic.px} cy={goalPic.py} r={markerRadius} color={colors.primary} />
                  <Circle cx={goalPic.px} cy={goalPic.py} r={markerHole} color="#ffffff" />
                </Group>
              ) : null}
              {pinPic ? (
                <Group>
                  <Circle cx={pinPic.px} cy={pinPic.py} r={markerRadius} color={pinProblem ? BAD_PIN_COLOR : PIN_COLOR} />
                  <Circle cx={pinPic.px} cy={pinPic.py} r={markerHole} color="#ffffff" />
                </Group>
              ) : null}
              {robotKnown ? (
                <Group>
                  <Circle c={centre} r={radius} color={poseLive ? colors.primary : '#9ca3af'} />
                  <Circle c={centre} r={radius} color="#ffffff" style="stroke" strokeWidth={outline} />
                  <Line p1={centre} p2={nose} color="#ffffff" strokeWidth={outline} />
                </Group>
              ) : null}
            </Group>
            {!connected ? <Rect x={0} y={0} width={size.width} height={size.height} color="rgba(243,245,248,0.55)" /> : null}
          </Canvas>
  );

  if (small) {
    return (
      <View style={styles.area} onLayout={onLayout} pointerEvents="none">
        {canvas}
      </View>
    );
  }

  return (
    <View style={styles.area} onLayout={onLayout}>
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill}>{canvas}</View>
      </GestureDetector>

      {picking ? (
        <Text style={[styles.badge, styles.topLeft, styles.prompt, pinProblem ? styles.badPrompt : null]}>
          {pinProblem ? `Can't go there: ${pinProblem.charAt(0).toLowerCase()}${pinProblem.slice(1)}` : pin ? 'Tap again to move the pin' : 'Tap where the robot should go'}
        </Text>
      ) : editingZones ? (
        <Text style={[styles.badge, styles.topLeft, styles.prompt, styles.zonePrompt]}>{zonePrompt(zoneEdit.adding, pickedZone !== null, pickedBox !== null)}</Text>
      ) : choosing && mapPrompt(choice) ? (
        <Text style={[styles.badge, styles.topLeft, styles.prompt, styles.cleanPrompt]}>{mapPrompt(choice)}</Text>
      ) : label ? (
        <Text style={[styles.badge, styles.topLeft]}>{label}</Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={fit} style={[styles.badge, styles.topRight]}>
        <Text style={styles.fitText}>Fit</Text>
      </Pressable>
      {currentMap && connected && !picking && !choosing && !editingZones && !makingMap ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change the no-go zones"
          onPress={editZones}
          style={[styles.badge, styles.besideFit]}
        >
          <Text style={[styles.fitText, zoneEditBlocked !== null && styles.blockedText]}>Zones</Text>
        </Pressable>
      ) : null}
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
      ) : !connected ? (
        <Text style={[styles.badge, styles.secondLeft]}>Connection lost: the map as it was</Text>
      ) : robotKnown && !poseLive ? (
        <Text style={[styles.badge, styles.secondLeft]}>Robot last seen {ageText(now - livePose.at)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  empty: { justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, color: colors.muted },
  emptySmall: { fontSize: 12 },
  badge: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs + 2,
    fontSize: 13,
    color: colors.text,
    overflow: 'hidden',
  },
  topLeft: { top: spacing.m, left: spacing.m },
  topRight: { top: spacing.m, right: spacing.m },
  besideFit: { top: spacing.m, right: spacing.m + 56 },
  blockedText: { color: colors.muted },
  secondLeft: { top: spacing.m + 36, left: spacing.m },
  fitText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  prompt: { fontWeight: '700', color: PIN_COLOR, right: 64 },
  badPrompt: { color: BAD_PIN_COLOR },
  cleanPrompt: { color: colors.cleaning },
  zonePrompt: { color: colors.danger },
  pickBar: { position: 'absolute', left: spacing.m, right: spacing.m, bottom: spacing.m, flexDirection: 'row', gap: spacing.m },
  pickButton: { flex: 1, height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  pickCancel: { backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: colors.border },
  pickCancelText: { fontSize: 16, fontWeight: '600', color: colors.text },
  pickGo: { backgroundColor: PIN_COLOR },
  pickGoDisabled: { opacity: 0.45 },
  pickGoText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
});
