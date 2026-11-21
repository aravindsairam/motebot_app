// The message card above the buttons: what the robot said no to and why, how a trip ended.
// Problems stay until dismissed; good news goes away by itself.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Notice } from '../robot/actionsStore';
import { colors, spacing } from './theme';

const LOOK = {
  error: { icon: '!', background: colors.dangerBackground, accent: colors.danger },
  success: { icon: '✓', background: colors.goodBackground, accent: colors.good },
  info: { icon: 'i', background: colors.infoBackground, accent: colors.primary },
} as const;

export function NoticeCard({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const look = LOOK[notice.tone];
  return (
    <View style={[styles.card, { backgroundColor: look.background, borderLeftColor: look.accent }]} accessibilityLiveRegion="polite">
      <View style={[styles.icon, { backgroundColor: look.accent }]}>
        <Text style={styles.iconText}>{look.icon}</Text>
      </View>
      <View style={styles.words}>
        <Text style={[styles.title, { color: look.accent }]}>{notice.title}</Text>
        {notice.text ? <Text style={styles.text}>{notice.text}</Text> : null}
      </View>
      <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: spacing.m,
    marginBottom: spacing.m,
    gap: spacing.m,
  },
  icon: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  iconText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  words: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  text: { fontSize: 14, color: colors.text, marginTop: 2 },
  close: { fontSize: 16, color: colors.muted, paddingLeft: spacing.xs },
});
