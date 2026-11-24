// The bar at the bottom of the screen: the message card (the answer to the last command when the
// robot did not do it, how a trip ended), an optional banner (failsafe, the choosing panel), the
// buttons, and Stop.
//
// On the Home tab the buttons are tiles (an icon over a word), with the main thing to do (Clean)
// and Stop side by side, large, below them. Elsewhere the buttons are a row of plain buttons,
// with Stop across the width below them; with a single button (Dock, on the other tabs) the
// button and Stop share one row.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Notice } from '../robot/actionsStore';
import { Icon, type IconName } from './icons';
import { NoticeCard } from './NoticeCard';
import { colors, fonts, radius, sheetShadow, spacing } from './theme';

export interface BarButton {
  key: string;
  label: string;
  enabled: boolean;
  hint: string | null; // why it is not usable, under the button
  onPress: () => void;
  active?: boolean; // shown tinted: what the robot is doing now (Driving, picking a point)
  primary?: boolean; // shown filled while usable: the step that goes ahead (Start, Save)
  icon?: IconName;
  color?: string; // a primary button's own colour (Explore is blue); teal when not given
  danger?: boolean; // red words: it throws something away (Discard)
}

interface StopButton {
  enabled: boolean;
  label: string;
  onPress: () => void;
}

/** A tile on the Home tab: an icon over its word. */
function Tile({ b }: { b: BarButton }) {
  const tint = b.active ? (b.color ?? colors.primary) : b.enabled ? colors.text : colors.faint;
  return (
    <View style={styles.column}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !b.enabled, selected: !!b.active }}
        accessibilityHint={b.hint ?? undefined}
        onPress={b.onPress}
        disabled={!b.enabled}
        style={({ pressed }) => [
          styles.tile,
          b.active ? [styles.tileActive, { borderColor: b.color ?? colors.primary }] : !b.enabled ? styles.tileOff : null,
          pressed && b.enabled && styles.pressed,
        ]}
      >
        {b.icon ? <Icon name={b.icon} color={tint} /> : null}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.tileText, { color: tint }, b.active && styles.bold]}>
          {b.label}
        </Text>
      </Pressable>
      {b.hint ? <Text style={styles.hint}>{b.hint}</Text> : null}
    </View>
  );
}

/** A plain button: outlined, or filled when it is the step that goes ahead. */
function PlainButton({ b, tall }: { b: BarButton; tall?: boolean }) {
  const tint = b.color ?? colors.primary;
  const filled = b.enabled && (b.primary || b.active);
  const wordColor = filled ? '#ffffff' : !b.enabled ? colors.faint : b.danger ? colors.dangerText : colors.text;
  return (
    <View style={styles.column}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !b.enabled }}
        accessibilityHint={b.hint ?? undefined}
        onPress={b.onPress}
        disabled={!b.enabled}
        style={({ pressed }) => [
          styles.button,
          tall && styles.buttonTall,
          filled ? { backgroundColor: tint, borderColor: tint } : !b.enabled ? styles.buttonOff : null,
          pressed && b.enabled && styles.pressed,
        ]}
      >
        {b.icon ? <Icon name={b.icon} size={18} color={wordColor} /> : null}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[filled ? styles.buttonTextFilled : styles.buttonText, { color: wordColor }]}
        >
          {b.label}
        </Text>
      </Pressable>
      {b.hint ? <Text style={styles.hint}>{b.hint}</Text> : null}
    </View>
  );
}

/** The big filled button beside Stop on the Home tab: Clean. */
function LeadButton({ b }: { b: BarButton }) {
  const tint = b.color ?? colors.primary;
  return (
    <View style={styles.column}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !b.enabled }}
        accessibilityHint={b.hint ?? undefined}
        onPress={b.onPress}
        disabled={!b.enabled}
        style={({ pressed }) => [styles.big, { backgroundColor: b.enabled ? tint : colors.primaryDisabled }, pressed && b.enabled && styles.pressed]}
      >
        {b.icon ? <Icon name={b.icon} color={b.enabled ? '#ffffff' : colors.primaryDisabledText} /> : null}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.bigText, !b.enabled && { color: colors.primaryDisabledText }]}>
          {b.label}
        </Text>
      </Pressable>
      {b.hint ? <Text style={styles.hint}>{b.hint}</Text> : null}
    </View>
  );
}

// big: beside the main button (Clean); alone: the only button (exploring); wide: across the width
// below a row of buttons; beside: next to a single button (Dock).
function Stop({ stop, size }: { stop: StopButton; size: 'big' | 'alone' | 'wide' | 'beside' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Stop the robot"
      accessibilityState={{ disabled: !stop.enabled }}
      onPress={stop.onPress}
      disabled={!stop.enabled}
      style={({ pressed }) => [
        styles.stop,
        size === 'big' && styles.stopBig,
        size === 'alone' && styles.stopAlone,
        size === 'beside' && styles.stopBeside,
        stop.enabled ? styles.stopOn : styles.stopOff,
        pressed && stop.enabled && styles.pressed,
      ]}
    >
      <Icon name="stop" size={16} color={stop.enabled ? '#ffffff' : colors.stopDisabledText} />
      <Text style={[styles.stopText, !stop.enabled && { color: colors.stopDisabledText }]}>{stop.label}</Text>
    </Pressable>
  );
}

export function ActionBar({
  buttons,
  lead,
  stop,
  notice,
  onDismiss,
  banner,
  tiles = false,
}: {
  buttons: BarButton[];
  lead?: BarButton; // beside Stop, large and filled: the main thing to do (Clean)
  stop: StopButton;
  notice: Notice | null;
  onDismiss: () => void;
  banner?: ReactNode;
  tiles?: boolean; // the Home tab's look: icon tiles, then the main button and Stop
}) {
  let body: ReactNode;
  if (tiles) {
    body = (
      <>
        {buttons.length ? (
          <View style={styles.row}>
            {buttons.map((b) => (
              <Tile key={b.key} b={b} />
            ))}
          </View>
        ) : null}
        <View style={styles.row}>
          {lead ? <LeadButton b={lead} /> : null}
          <Stop stop={stop} size="big" />
        </View>
      </>
    );
  } else if (buttons.length === 1) {
    body = (
      <View style={styles.row}>
        <PlainButton b={buttons[0]} tall />
        <Stop stop={stop} size="beside" />
      </View>
    );
  } else {
    body = (
      <>
        {buttons.length ? (
          <View style={styles.row}>
            {buttons.map((b) => (
              <PlainButton key={b.key} b={b} />
            ))}
          </View>
        ) : null}
        {lead ? (
          <View style={styles.row}>
            <LeadButton b={lead} />
            <Stop stop={stop} size="big" />
          </View>
        ) : (
          <Stop stop={stop} size={buttons.length ? 'wide' : 'alone'} />
        )}
      </>
    );
  }
  return (
    <View style={styles.bar}>
      {notice ? <NoticeCard notice={notice} onDismiss={onDismiss} /> : null}
      {banner}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.l,
    paddingTop: 14,
    paddingBottom: spacing.m,
    gap: 10,
    ...sheetShadow,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s },
  column: { flex: 1 },
  pressed: { opacity: 0.8 },
  bold: { fontWeight: '700' },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.xs },

  tile: {
    height: 64,
    borderRadius: radius.l,
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderStyle: 'solid', // named: Android keeps a dashed edge after a tile becomes usable otherwise
    borderColor: colors.soft,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 2,
  },
  tileActive: { backgroundColor: colors.primarySoft, borderWidth: 1.5 },
  tileOff: { backgroundColor: colors.card, borderColor: colors.field, borderStyle: 'dashed' },
  tileText: { fontSize: 13, fontWeight: '600' },

  button: {
    height: 48,
    borderRadius: radius.l,
    borderWidth: 1,
    borderStyle: 'solid', // named, for the same reason as the tile's
    borderColor: colors.field,
    backgroundColor: colors.card,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xs,
  },
  buttonTall: { height: 52, borderRadius: radius.xl },
  buttonOff: { borderStyle: 'dashed', borderColor: '#d4dbd9' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  buttonTextFilled: { fontSize: 16, fontFamily: fonts.display },

  big: { height: 56, borderRadius: radius.xl, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.s },
  bigText: { fontSize: 18, fontFamily: fonts.display, color: '#ffffff' },

  stop: { height: 52, borderRadius: radius.xl, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.s },
  stopBig: { flex: 1, height: 56 }, // flex only in a row: in the bar's column it would squeeze Stop to nothing
  stopAlone: { height: 56 },
  stopBeside: { flex: 1.6 },
  stopOn: { backgroundColor: colors.danger, elevation: 3, shadowColor: colors.danger, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  stopOff: { backgroundColor: colors.stopDisabled },
  stopText: { fontSize: 18, fontFamily: fonts.display, color: '#ffffff', letterSpacing: 1 },
});
