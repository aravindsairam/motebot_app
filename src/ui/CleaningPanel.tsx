// The clean under way, in a white strip under the status strip: a thin bar of how much of the
// planned floor is cleaned, then four numbers: that share, the area, the distance driven and the
// time spent cleaning. All from where the robot has really been. An old copy is greyed, like
// everything else that is not current.

import { StyleSheet, Text, View } from 'react-native';

import { useCleaning } from '../robot/cleaningStore';
import { ENDED_STATES, liveNumbers, targetLabel } from '../robot/cleaningText';
import { isFresh } from '../robot/store';
import { useNow } from './parts';
import { colors, fonts, spacing } from './theme';

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
  const share = Math.min(100, Math.max(0, status.value.coverage || 0));
  const items = [
    { value: n.coverage, label: 'cleaned' },
    { value: n.area, label: 'area' },
    { value: n.distance, label: 'driven' },
    { value: n.time, label: 'time' },
  ];
  return (
    <View style={[styles.panel, !live && styles.old]} accessibilityLabel={`Cleaning ${targetLabel(status.value.target)}`}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${share}%` }]} />
      </View>
      <View style={styles.numbers}>
        {items.map((item, i) => (
          <View key={item.label} style={styles.item}>
            <Text style={[styles.value, i === 0 && styles.lead]} numberOfLines={1}>
              {item.value}
            </Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Shared with the exploring panel: the same strip, the same numbers.
export const panelStyles = StyleSheet.create({
  // It runs on from the status strip: it covers the strip's bottom line and draws its own.
  panel: {
    marginTop: -1,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 2,
    paddingBottom: spacing.m,
    paddingHorizontal: spacing.l,
    gap: 10,
  },
  old: { opacity: 0.45 },
  numbers: { flexDirection: 'row', gap: spacing.xs },
  item: { flex: 1, alignItems: 'center', gap: 1 },
  value: { fontFamily: fonts.display, fontSize: 22, color: colors.text, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, color: colors.muted },
  waiting: { textAlign: 'center', fontSize: 14, color: colors.muted, paddingVertical: spacing.xs },
});

const styles = StyleSheet.create({
  ...panelStyles,
  track: { height: 6, borderRadius: 3, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  lead: { color: colors.primary },
});
