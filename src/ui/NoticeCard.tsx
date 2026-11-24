// The message card above the buttons: what the robot said no to and why, how a trip ended.
// Problems stay until dismissed; good news goes away by itself.
//
// A rounded card tinted by its tone (red, green, blue), a small filled circle with "!", a check or
// "i", the title in the tone's colour and the text under it. It has no margin of its own: the
// place that shows it spaces it.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Notice } from '../robot/actionsStore';
import { Icon } from './icons';
import { colors, radius, spacing } from './theme';

const LOOK = {
  error: { mark: '!', background: colors.dangerBackground, accent: colors.danger, words: colors.dangerText },
  success: { mark: null, background: colors.goodBackground, accent: colors.good, words: colors.goodText }, // a check
  info: { mark: 'i', background: colors.infoBackground, accent: colors.info, words: colors.info },
} as const;

export function NoticeCard({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const look = LOOK[notice.tone];
  return (
    <View style={[styles.card, { backgroundColor: look.background }]} accessibilityLiveRegion="polite">
      <View style={[styles.icon, { backgroundColor: look.accent }]}>
        {look.mark ? <Text style={styles.iconText}>{look.mark}</Text> : <Icon name="check" size={14} color="#ffffff" strokeWidth={3} />}
      </View>
      <View style={styles.words}>
        <Text style={[styles.title, { color: look.words }]}>{notice.title}</Text>
        {notice.text ? <Text style={styles.text}>{notice.text}</Text> : null}
      </View>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.close}>
        <Icon name="close" size={16} color={colors.muted} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.l,
    paddingVertical: spacing.m,
    paddingHorizontal: 14,
    gap: spacing.m,
  },
  icon: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  iconText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  words: { flex: 1 },
  title: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 20, color: colors.text, marginTop: 2 },
  // A 44 point touch area that does not make the card taller: it reaches into the padding.
  close: { width: 44, height: 44, marginVertical: -11, marginRight: -12, marginLeft: -spacing.s, justifyContent: 'center', alignItems: 'center' },
});
