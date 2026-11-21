// The joystick: a ring with a knob that follows the thumb. Up drives forward, sideways turns.
// It sends while held and stops the robot when let go, when the app goes to the background, and
// when it disappears from the screen.

import { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { holdStick, releaseStick } from '../robot/drive';
import { colors } from './theme';

const SIZE = 150; // the ring, on screen
const KNOB = 64;
const TRAVEL = (SIZE - KNOB) / 2; // how far the knob's centre may move from the ring's centre

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
        <Text style={[styles.arrow, styles.up]}>▲</Text>
        <Text style={[styles.arrow, styles.down]}>▼</Text>
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
    backgroundColor: 'rgba(17,24,39,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#ffffff',
    elevation: 4,
  },
  arrow: { position: 'absolute', color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  up: { top: 8 },
  down: { bottom: 8 },
});
