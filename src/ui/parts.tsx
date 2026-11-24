// Small building blocks shared by the screens.

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from './theme';

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

/** A white card with a small capital title. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/** One line of a card: a label on the left, its value beside it. */
export function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** A tinted box for something that needs attention: a lost connection, the failsafe. */
export function Banner({ tone, title, children }: { tone: 'warning' | 'danger'; title: string; children?: ReactNode }) {
  const danger = tone === 'danger';
  return (
    <View style={[styles.banner, { backgroundColor: danger ? colors.dangerBackground : colors.warningBackground }]}>
      <View style={styles.bannerHead}>
        <View style={[styles.bannerIcon, { backgroundColor: danger ? colors.danger : colors.warning }]}>
          <Text style={styles.bannerIconText}>!</Text>
        </View>
        <Text style={[styles.bannerTitle, { color: danger ? colors.dangerText : colors.warning }]}>{title}</Text>
      </View>
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
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        plain ? styles.buttonPlain : { backgroundColor: disabled ? colors.primaryDisabled : colors.primary },
        plain && disabled ? styles.buttonPlainOff : null,
        pressed && !disabled ? { opacity: 0.8 } : null,
      ]}
    >
      <Text
        style={[
          plain ? styles.buttonTextPlain : styles.buttonText,
          plain && disabled ? { color: colors.faint } : null,
          !plain && disabled ? { color: colors.primaryDisabledText } : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A small rounded label, light: the mode in the status strip. `strong` fills it with its colour. */
export function Chip({ label, color, background, strong }: { label: string; color: string; background: string; strong?: boolean }) {
  return (
    <View style={[styles.chip, { backgroundColor: strong ? color : background }]}>
      <Text style={[styles.chipText, { color: strong ? '#ffffff' : color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl + 2,
    borderWidth: 1,
    borderColor: '#e3e8e6',
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginBottom: spacing.s + 2 },
  row: { flexDirection: 'row', paddingVertical: 5, gap: spacing.m },
  rowLabel: { width: 120, fontSize: 15, color: colors.muted },
  rowValue: { flex: 1, fontSize: 15, color: colors.text },
  banner: { borderRadius: radius.xl, padding: 14, marginBottom: spacing.m },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerIcon: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  bannerIconText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  bannerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  button: { height: 52, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.l },
  // borderStyle is named: Android keeps a dashed edge after the button becomes usable otherwise.
  buttonPlain: { backgroundColor: colors.card, borderWidth: 1, borderStyle: 'solid', borderColor: colors.field },
  buttonPlainOff: { borderStyle: 'dashed', borderColor: '#d4dbd9' },
  buttonText: { color: '#ffffff', fontSize: 17, fontFamily: fonts.display },
  buttonTextPlain: { color: colors.text, fontSize: 16, fontWeight: '600' },
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
});
