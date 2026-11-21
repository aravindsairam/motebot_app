// Small building blocks shared by the screens.

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from './theme';

/** The current time, updated every `periodMs`, for showing how old something is. */
export function useNow(periodMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(timer);
  }, [periodMs]);
  return now;
}

export function ageText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function Banner({ tone, title, children }: { tone: 'warning' | 'danger'; title: string; children?: ReactNode }) {
  const danger = tone === 'danger';
  return (
    <View style={[styles.banner, { backgroundColor: danger ? colors.dangerBackground : colors.warningBackground }]}>
      <Text style={[styles.bannerTitle, { color: danger ? colors.danger : colors.warning }]}>{title}</Text>
      {children}
    </View>
  );
}

export function Button({ label, onPress, disabled, kind = 'primary' }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'plain';
}) {
  const plain = kind === 'plain';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        plain ? styles.buttonPlain : { backgroundColor: disabled ? colors.primaryDisabled : colors.primary },
        pressed && !disabled ? { opacity: 0.8 } : null,
      ]}
    >
      <Text style={[styles.buttonText, plain ? { color: colors.primary } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 10, padding: spacing.l, marginBottom: spacing.m },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginBottom: spacing.s },
  row: { flexDirection: 'row', paddingVertical: 3 },
  rowLabel: { width: 130, fontSize: 15, color: colors.muted },
  rowValue: { flex: 1, fontSize: 15, color: colors.text },
  banner: { borderRadius: 10, padding: spacing.m, marginBottom: spacing.m },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  button: { height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.l },
  buttonPlain: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chip: { borderRadius: 999, paddingHorizontal: spacing.m, paddingVertical: 4, alignSelf: 'flex-start' },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
});
