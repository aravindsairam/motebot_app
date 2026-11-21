// The bar at the bottom of the screen: the message card (the answer to the last command when the
// robot did not do it, how a trip ended), an optional banner (failsafe, the choosing panel), the
// buttons, and Stop. With more than one button they get a row of their own and Stop spans the
// width below them, or shares that row with one leading button (Clean).

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Notice } from '../robot/actionsStore';
import { NoticeCard } from './NoticeCard';
import { colors, spacing } from './theme';

export interface BarButton {
  key: string;
  label: string;
  enabled: boolean;
  hint: string | null; // why it is not usable, under the button
  onPress: () => void;
  active?: boolean; // shown filled: what the robot is doing now (Driving)
  primary?: boolean; // shown filled while usable: the step that goes ahead (Start)
}

function BarButtonView({ b, small, color }: { b: BarButton; small: boolean; color?: string }) {
  const tint = color ?? colors.primary;
  const filled = b.active || (b.primary && b.enabled);
  return (
    <View style={styles.column}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !b.enabled }}
        onPress={b.onPress}
        disabled={!b.enabled}
        style={({ pressed }) => [
          styles.button,
          { borderColor: tint },
          small && styles.buttonSmall,
          filled ? { backgroundColor: tint } : !b.enabled && styles.buttonDisabled,
          pressed && b.enabled && styles.pressed,
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[styles.buttonText, { color: tint }, small && styles.buttonTextSmall, filled ? styles.buttonTextActive : !b.enabled && { color: colors.muted }]}
        >
          {b.label}
        </Text>
      </Pressable>
      {b.hint ? <Text style={styles.hint}>{b.hint}</Text> : null}
    </View>
  );
}

export function ActionBar({
  buttons,
  lead,
  stop,
  notice,
  onDismiss,
  banner,
}: {
  buttons: BarButton[];
  lead?: BarButton & { color?: string }; // shares Stop's row, filled: the main thing to do (Clean)
  stop: { enabled: boolean; label: string; onPress: () => void };
  notice: Notice | null;
  onDismiss: () => void;
  banner?: ReactNode;
}) {
  const wide = buttons.length > 1;
  const stopButton = (beside: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Stop the robot"
      onPress={stop.onPress}
      disabled={!stop.enabled}
      style={({ pressed }) => [
        styles.stop,
        wide && !beside && styles.stopWide,
        wide && beside && styles.stopBeside,
        !stop.enabled && styles.stopDisabled,
        pressed && stop.enabled && styles.pressed,
      ]}
    >
      <Text style={styles.stopText}>{stop.label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.bar}>
      {notice ? <NoticeCard notice={notice} onDismiss={onDismiss} /> : null}
      {banner}
      <View style={styles.row}>
        {buttons.map((b) => (
          <BarButtonView key={b.key} b={b} small={wide} />
        ))}
        {!wide ? stopButton(false) : null}
      </View>
      {wide && lead ? (
        <View style={[styles.row, styles.secondRow]}>
          <BarButtonView b={{ ...lead, primary: true }} small color={lead.color} />
          {stopButton(true)}
        </View>
      ) : wide ? (
        stopButton(false)
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.m,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s },
  column: { flex: 1 },
  button: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  buttonSmall: { height: 46, borderRadius: 10 },
  buttonDisabled: { borderColor: colors.border },
  buttonText: { fontSize: 17, fontWeight: '600', color: colors.primary },
  buttonTextSmall: { fontSize: 15 },
  buttonTextActive: { color: '#ffffff' },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.xs },
  stop: { flex: 1.6, height: 56, borderRadius: 12, backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center' },
  stopWide: { flex: 0, height: 52, marginTop: spacing.s },
  stopBeside: { height: 46, borderRadius: 10 },
  secondRow: { marginTop: spacing.s },
  stopDisabled: { backgroundColor: '#f3a5a5' },
  stopText: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  pressed: { opacity: 0.8 },
});
