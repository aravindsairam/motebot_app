// The rooms' names on the Home map, each at its room's open spot. They follow the map as a finger
// moves and zooms it (on the UI thread, like the robot), but keep their size, so they stay
// readable. Small and light, to keep the map clean. While the rooms are being changed they are
// bolder, and a tap on one renames that room.

import { labelPoint } from '../robot/rooms';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { type MapPlacement, toPicture } from '../robot/mapPicture';
import { colors } from './theme';

const LABEL_WIDTH = 132; // a long name ends in "…"
const LABEL_HEIGHT = 36; // room for the bolder label at a large text size

interface ViewValues {
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}

function RoomLabel({ name, px, py, view, onPress }: { name: string; px: number; py: number; view: ViewValues; onPress: (() => void) | null }) {
  const { scale, tx, ty } = view;
  const place = useAnimatedStyle(
    () => ({
      transform: [{ translateX: px * scale.value + tx.value - LABEL_WIDTH / 2 }, { translateY: py * scale.value + ty.value - LABEL_HEIGHT / 2 }],
    }),
    [px, py],
  );
  if (onPress === null) {
    return (
      <Animated.View style={[styles.place, place]} pointerEvents="none">
        <Text style={styles.light} numberOfLines={1}>
          {name}
        </Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[styles.place, place]} pointerEvents="box-none">
      <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Rename ${name}`} style={styles.editing}>
        <Text style={styles.editingText} numberOfLines={1}>
          {name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** `onPress`: while the rooms are being changed, what a tap on the label of room `index` does. */
export function RoomLabels({
  rooms,
  map,
  view,
  onPress,
}: {
  rooms: readonly { name: string; points: number[]; x: number; y: number }[];
  map: MapPlacement;
  view: ViewValues;
  onPress?: (index: number) => void;
}) {
  return (
    <>
      {rooms.map((room, i) => {
        const middle = labelPoint(room);
        const q = toPicture(map, middle.x, middle.y);
        return <RoomLabel key={`${i} ${room.name}`} name={room.name} px={q.px} py={q.py} view={view} onPress={onPress ? () => onPress(i) : null} />;
      })}
    </>
  );
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: 0, top: 0, width: LABEL_WIDTH, height: LABEL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  light: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(55,65,81,0.7)',
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowRadius: 3,
  },
  editing: {
    maxWidth: LABEL_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  editingText: { fontSize: 13, fontWeight: '700', color: colors.text },
});
