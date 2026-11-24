// The main screen's picture: one view large, the other in a small window in a corner. Tap the
// window to swap the map and the camera; its ✕ hides it, and a white pill brings it back. Drag it
// with a finger: let go, and it glides to the nearest corner (a flick counts in its direction). The
// top corners sit below the map's row of tools, and while the joystick shows (manual and mapping
// modes) it keeps the bottom right, so a window there shows bottom left. While a point is being
// picked on the map, a clean is being chosen, or the no-go zones or the rooms are being changed,
// the map is large and the window is out of the way.
//
// The window has rounded corners, a white edge and a soft shadow; the ✕ is a small dark disc.
//
// The window follows the finger on the UI thread (shared values and an animated style), not
// through React, so it does not lag. Both views keep their place in the tree whichever is small:
// a swap or a drag never restarts the video.

import { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useChoice } from '../robot/cleaningStore';
import { useRoomEdit } from '../robot/roomEditStore';
import { useTrip } from '../robot/tripStore';
import { useZoneEdit } from '../robot/zones';
import { CameraView } from './CameraView';
import { type Corner, CORNER_MARGIN, cornerOrigin, nearestCorner, shownCorner, TOP_INSET } from './corner';
import { Icon } from './icons';
import { Joystick } from './Joystick';
import { MapView } from './MapView';
import { setCorner, showCorner, swapViews, useStage } from './stageStore';
import { colors, floatShadow, radius, spacing } from './theme';

const CORNER_SHARE = 0.38; // of the stage's width
const CORNER_MAX_HEIGHT = 0.4; // of the stage's height: on a short stage (a small phone) the window is smaller
const CORNER_ASPECT = 0.75; // height / width: the camera's 4:3
const GLIDE_MS = 180; // to a new corner when the stage or the joystick changes
const SPRING = { damping: 20, stiffness: 220 }; // to the corner after a drag
const WINDOW_GROUND = '#2e3936'; // behind the window's view while it loads: the map's wall colour
const WINDOW_SHADOW = { elevation: 6, shadowColor: colors.text, shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } };

function placeKey(c: Corner, width: number, height: number): string {
  return `${c} ${width} ${height}`;
}

export function Stage({ joystick }: { joystick: { shown: boolean; enabled: boolean } }) {
  const { big, cornerShown, corner } = useStage();
  const pickingPoint = useTrip((s) => s.picking);
  const choosing = useChoice((s) => s.open);
  const editingZones = useZoneEdit((s) => s.open);
  const editingRooms = useRoomEdit((s) => s.open);
  const picking = pickingPoint || choosing || editingZones || editingRooms; // the map is being used: large, nothing over it
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Picking a point, or choosing what to clean, needs the map, large.
  useEffect(() => {
    if (picking && big !== 'map') swapViews();
  }, [picking, big]);

  const winW = Math.round(Math.min(size.width * CORNER_SHARE, (size.height * CORNER_MAX_HEIGHT) / CORNER_ASPECT));
  const winH = Math.round(winW * CORNER_ASPECT);
  const showSmall = cornerShown && !picking && size.width > 0;
  const shown = shownCorner(corner, joystick.shown);
  const other = big === 'map' ? 'camera' : 'map';

  // The window's top-left corner on the stage, and copies of the sizes for the gesture.
  const winX = useSharedValue(0);
  const winY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const stageSv = useSharedValue({ width: 0, height: 0 });
  const winSv = useSharedValue({ width: 0, height: 0 });
  const joystickSv = useSharedValue(joystick.shown);
  // What the window was last sent to (corner and stage size): a drag glides there itself, and
  // nothing else needs to move it again until one of them changes.
  const placedFor = useRef('');
  const latest = useRef({ width: 0, height: 0, joystick: false });
  latest.current = { width: size.width, height: size.height, joystick: joystick.shown };

  // Into its corner: at once the first time, then gliding when the stage's size, the corner or the
  // joystick changes (the cleaning panel makes the stage shorter, for one).
  useEffect(() => {
    stageSv.value = { width: size.width, height: size.height };
    winSv.value = { width: winW, height: winH };
    joystickSv.value = joystick.shown;
    if (size.width === 0 || dragging.value) return;
    const key = placeKey(shown, size.width, size.height);
    if (key === placedFor.current) return;
    const first = placedFor.current === '';
    placedFor.current = key;
    const o = cornerOrigin(shown, size, { width: winW, height: winH });
    if (first) {
      winX.value = o.x;
      winY.value = o.y;
    } else {
      winX.value = withTiming(o.x, { duration: GLIDE_MS });
      winY.value = withTiming(o.y, { duration: GLIDE_MS });
    }
  }, [shown, size, winW, winH, joystick.shown, stageSv, winSv, joystickSv, dragging, winX, winY]);

  function droppedIn(c: Corner) {
    const l = latest.current;
    placedFor.current = placeKey(shownCorner(c, l.joystick), l.width, l.height);
    setCorner(c);
  }

  const pan = usePanGesture({
    minDistance: 8,
    onActivate: () => {
      'worklet';
      dragging.value = true;
    },
    onUpdate: (e) => {
      'worklet';
      const s = stageSv.value;
      const w = winSv.value;
      winX.value = Math.min(Math.max(winX.value + e.changeX, 0), Math.max(0, s.width - w.width));
      winY.value = Math.min(Math.max(winY.value + e.changeY, 0), Math.max(0, s.height - w.height));
    },
    onDeactivate: (e) => {
      'worklet';
      const s = stageSv.value;
      const w = winSv.value;
      const c = nearestCorner(winX.value, winY.value, e.velocityX, e.velocityY, s, w);
      const o = cornerOrigin(shownCorner(c, joystickSv.value), s, w);
      winX.value = withSpring(o.x, SPRING);
      winY.value = withSpring(o.y, SPRING);
      dragging.value = false;
      scheduleOnRN(droppedIn, c);
    },
  });
  const tap = useTapGesture({ runOnJS: true, onActivate: () => swapViews() });
  const gestures = useExclusiveGestures(pan, tap);

  // The small view moves with the window; the large one stays put.
  const mapMove = useAnimatedStyle(
    () => ({ transform: [{ translateX: big === 'map' ? 0 : winX.value }, { translateY: big === 'map' ? 0 : winY.value }] }),
    [big],
  );
  const cameraMove = useAnimatedStyle(
    () => ({ transform: [{ translateX: big === 'camera' ? 0 : winX.value }, { translateY: big === 'camera' ? 0 : winY.value }] }),
    [big],
  );
  const touchMove = useAnimatedStyle(() => ({ transform: [{ translateX: winX.value }, { translateY: winY.value }] }));

  const frame: ViewStyle = { ...styles.frame, width: winW, height: winH };
  const place = (view: 'map' | 'camera'): ViewStyle => (big === view ? styles.large : showSmall ? frame : styles.hidden);
  const reopenAt: ViewStyle = {
    ...(shown === 'topLeft' || shown === 'topRight' ? { top: TOP_INSET } : { bottom: CORNER_MARGIN }),
    ...(shown === 'topLeft' || shown === 'bottomLeft' ? { left: CORNER_MARGIN } : { right: CORNER_MARGIN }),
  };

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }

  return (
    <View style={styles.stage} onLayout={onLayout}>
      <Animated.View style={[place('map'), mapMove]}>
        <MapView small={big !== 'map'} />
      </Animated.View>
      <Animated.View style={[place('camera'), cameraMove]}>
        <CameraView small={big !== 'camera'} active={big === 'camera' || showSmall} />
      </Animated.View>

      {showSmall ? (
        <Animated.View style={[frame, styles.touch, touchMove]}>
          <GestureDetector gesture={gestures}>
            <View
              style={StyleSheet.absoluteFill}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Show the ${other} large; drag to move this window`}
            />
          </GestureDetector>
          <Pressable style={styles.hide} onPress={() => showCorner(false)} accessibilityRole="button" accessibilityLabel="Hide the corner window">
            <View style={styles.hideDisc}>
              <Icon name="close" size={12} color="#ffffff" strokeWidth={3} />
            </View>
          </Pressable>
        </Animated.View>
      ) : !picking ? (
        <Pressable style={({ pressed }) => [styles.reopen, reopenAt, pressed && styles.pressed]} onPress={() => showCorner(true)} accessibilityRole="button">
          <Icon name={other === 'camera' ? 'camera' : 'newMap'} size={18} color={colors.text} strokeWidth={1.9} />
          <Text style={styles.reopenText}>{other === 'camera' ? 'Show camera' : 'Show map'}</Text>
        </Pressable>
      ) : null}

      {joystick.shown && !picking ? (
        <View style={styles.joystick} pointerEvents="box-none">
          <Joystick enabled={joystick.enabled} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: colors.mapUnknown, overflow: 'hidden' },
  large: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  hidden: { display: 'none' },
  frame: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: radius.l,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: WINDOW_GROUND,
    ...WINDOW_SHADOW,
    zIndex: 2,
  },
  touch: { backgroundColor: 'transparent', borderColor: 'transparent', zIndex: 3, elevation: 7, shadowOpacity: 0 },
  // The ✕: a 26 px dark disc in the window's corner, inside a 44 px touch area.
  hide: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  hideDisc: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' },
  reopen: {
    position: 'absolute',
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.float,
    ...floatShadow,
    zIndex: 2,
  },
  reopenText: { fontSize: 14, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.7 },
  joystick: { position: 'absolute', right: spacing.l, bottom: spacing.l, zIndex: 4, elevation: 8 },
});
