// The joystick: a ring with a knob that follows the thumb. Up drives forward, sideways turns.
// It sends while held and stops the robot when let go, when the app goes to the background, and
// when it disappears from the screen. A white see-through ring with four small grey arrows, and a
// blue knob (the mapping mode's colour).

import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { holdStick, releaseStick } from '../robot/drive';
import { colors } from './theme';

const SIZE = 136; // the ring, on screen
const KNOB = 56;
const TRAVEL = (SIZE - KNOB) / 2; // how far the knob's centre may move from the ring's centre
const EDGE = 1.5; // the ring's edge
const RING = 'rgba(255,255,255,0.88)';
const ARROW = '#9aa6a2'; // the arrows' grey, as in the design
// Four small triangles 14 px in from the ring's edge, pointing out.
const MID = SIZE / 2;
const ARROWS = `M${MID} 14l-6 8h12z M${MID} ${SIZE - 14}l-6 -8h12z M14 ${MID}l8 -6v12z M${SIZE - 14} ${MID}l-8 -6v12z`;

export function Joystick({ enabled }: { enabled: boolean }) {
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') releaseStick();
    });
    return () => {
      sub.remove();
      releaseStick();
    };
  }, []);
  useEffect(() => {
    if (!enabled) {
      releaseStick();
      knobX.value = 0;
      knobY.value = 0;
    }
  }, [enabled, knobX, knobY]);

  function follow(x: number, y: number) {
    // x, y: the touch in the ring's own coordinates; the knob stays inside the ring
    let dx = x - SIZE / 2;
    let dy = y - SIZE / 2;
    const r = Math.hypot(dx, dy);
    if (r > TRAVEL) {
      dx = (dx / r) * TRAVEL;
      dy = (dy / r) * TRAVEL;
    }
    knobX.value = dx;
    knobY.value = dy;
    holdStick(dx / TRAVEL, -dy / TRAVEL);
  }

  function letGo() {
    knobX.value = 0;
    knobY.value = 0;
    releaseStick();
  }

  const pan = usePanGesture({
    runOnJS: true,
    enabled,
    minDistance: 0,
    shouldCancelWhenOutside: false,
    onBegin: (e) => follow(e.x, e.y),
    onUpdate: (e) => follow(e.x, e.y),
    onFinalize: () => letGo(),
  });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knobX.value }, { translateY: knobY.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.ring, !enabled && styles.disabled]}
        accessibilityRole="adjustable"
        accessibilityLabel="Joystick: hold and push up to drive forward, sideways to turn"
      >
        <Svg width={SIZE} height={SIZE} style={styles.arrows} accessible={false} pointerEvents="none">
          <Path d={ARROWS} fill={ARROW} />
        </Svg>
        <Animated.View style={[styles.knob, knobStyle]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: RING,
    borderWidth: EDGE,
    borderColor: colors.field,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: colors.text,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  disabled: { opacity: 0.4 },
  arrows: { position: 'absolute', left: -EDGE, top: -EDGE },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.info,
    elevation: 6,
    shadowColor: colors.info,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
});
