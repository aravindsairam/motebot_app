// The rooms' names on the Home map, each at its room's open spot. They follow the map as a finger
// moves and zooms it (on the UI thread, like the robot), but keep their size, so they stay
// readable. Small and light with a white halo, to keep the map clean; the room chosen for a clean
// is a teal pill. While the rooms are being changed each name is a white pill edged in teal, and a
// tap on one renames that room.

import { labelPoint } from '../robot/rooms';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { type MapPlacement, toPicture } from '../robot/mapPicture';
import { colors, radius } from './theme';

const LABEL_WIDTH = 132; // a long name ends in "…"
const LABEL_HEIGHT = 44; // the pill's touch area while the rooms are being changed
const CHIP_SHADOW = { elevation: 2, shadowColor: colors.text, shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } };

interface ViewValues {
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}

function RoomLabel({
  name,
  px,
  py,
  view,
  chosen,
  onPress,
}: {
  name: string;
  px: number;
  py: number;
  view: ViewValues;
  chosen: boolean;
  onPress: (() => void) | null;
}) {
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
        {chosen ? (
          <View style={styles.chosen}>
            <Text style={styles.chosenText} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ) : (
          <Text style={styles.light} numberOfLines={1}>
            {name}
          </Text>
        )}
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[styles.place, place]} pointerEvents="box-none">
      <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Rename ${name}`} style={styles.touch}>
        <View style={styles.editing}>
          <Text style={styles.editingText} numberOfLines={1}>
            {name}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** `onPress`: while the rooms are being changed, what a tap on the label of room `index` does.
 *  `chosen`: the name of the room picked for a clean, drawn as a teal pill. */
export function RoomLabels({
  rooms,
  map,
  view,
  chosen = null,
  onPress,
}: {
  rooms: readonly { name: string; points: number[]; x: number; y: number }[];
  map: MapPlacement;
  view: ViewValues;
  chosen?: string | null;
  onPress?: (index: number) => void;
}) {
  return (
    <>
      {rooms.map((room, i) => {
        const middle = labelPoint(room);
        const q = toPicture(map, middle.x, middle.y);
        return (
          <RoomLabel
            key={`${i} ${room.name}`}
            name={room.name}
            px={q.px}
            py={q.py}
            view={view}
            chosen={chosen !== null && room.name === chosen}
            onPress={onPress ? () => onPress(i) : null}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: 0, top: 0, width: LABEL_WIDTH, height: LABEL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  light: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    textShadowColor: '#ffffff',
    textShadowRadius: 3,
  },
  chosen: {
    maxWidth: LABEL_WIDTH,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    ...CHIP_SHADOW,
  },
  chosenText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  touch: { maxWidth: LABEL_WIDTH, minHeight: LABEL_HEIGHT, justifyContent: 'center' },
  editing: {
    backgroundColor: '#ffffff',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  editingText: { fontSize: 12, fontWeight: '700', color: colors.primary },
});
