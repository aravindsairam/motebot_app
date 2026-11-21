// The clean under way, in four numbers under the status strip: how much of the planned floor is
// cleaned, the area, the distance driven and the time spent cleaning. All from where the robot
// has really been. An old copy is greyed, like everything else that is not current.

import { StyleSheet, Text, View } from 'react-native';

import { useCleaning } from '../robot/cleaningStore';
import { ENDED_STATES, liveNumbers, targetLabel } from '../robot/cleaningText';
import { isFresh } from '../robot/store';
import { useNow } from './parts';
import { colors, spacing } from './theme';

/** `starting`: this phone has asked for a clean and waits for the answer; the status may still be
 *  the last clean's. */
export function CleaningPanel({ starting }: { starting: boolean }) {
  const now = useNow(500);
  const status = useCleaning((s) => s.status);
  if (status === null || status.value.jobId === 0 || (starting && ENDED_STATES.includes(status.value.state))) {
    return (
      <View style={styles.panel}>
        <Text style={styles.waiting}>Getting ready to clean…</Text>
      </View>
    );
  }
  const live = isFresh(status, now);
  const n = liveNumbers(status.value);
  const items = [
    { value: n.coverage, label: 'cleaned' },
    { value: n.area, label: 'area' },
    { value: n.distance, label: 'driven' },
    { value: n.time, label: 'time' },
  ];
  return (
    <View style={[styles.panel, !live && styles.old]} accessibilityLabel={`Cleaning ${targetLabel(status.value.target)}`}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Text style={styles.value} numberOfLines={1}>
            {item.value}
          </Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    backgroundColor: colors.cleaningBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
  },
  old: { opacity: 0.45 },
  item: { flex: 1, alignItems: 'center' },
  value: { fontSize: 20, fontWeight: '700', color: colors.cleaning, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, color: colors.muted },
  waiting: { flex: 1, textAlign: 'center', fontSize: 14, color: colors.muted, paddingVertical: spacing.xs },
});
