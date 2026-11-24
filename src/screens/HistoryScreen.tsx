// The History tab: every clean the robot has recorded on this map, newest first under the day it
// started, with the totals at the top. Tap one to see its numbers and the robot's picture of it.
// Pull down to ask again; the list is also asked for when the tab is shown and when a clean ends.
//
// The robot keeps the history (its most recent cleans, and totals over every clean ever); the
// app only shows it.

import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCleaning } from '../robot/cleaningStore';
import { ENDED_STATES, historyDays, historyLine, totalsNumbers, totalsText } from '../robot/cleaningText';
import { loadHistory, openRecord } from '../robot/history';
import { useHistory } from '../robot/historyStore';
import { useRobot } from '../robot/store';
import type { CleaningRecord } from '../transport/messages';
import { Icon, type IconName } from '../ui/icons';
import { Banner, useNow } from '../ui/parts';
import { EndedChip, endedLook, RecordDialog } from '../ui/RecordDialog';
import { RobotActionBar } from '../ui/RobotActions';
import { StatusStrip } from '../ui/StatusStrip';
import { colors, fonts, radius, spacing } from '../ui/theme';

const LIGHT_EDGE = '#e3e8e6'; // the edge of a card on the ground
const CHEVRON = '#9aa6a2';

/** The picture beside a clean: the house for everything, a dashed box for an area, sparkles for the rest. */
function targetIcon(target: string): IconName {
  if (target === 'everything' || target === '') return 'home';
  if (target === 'area') return 'area';
  return 'clean'; // a spot, a room or a saved plan
}

function RecordRow({ record, now }: { record: CleaningRecord; now: number }) {
  const line = historyLine(record, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${line.when}, ${line.what}, ${line.numbers}, ${endedLook(line.ended).label}`}
      onPress={() => void openRecord(record.id)}
      style={({ pressed }) => [styles.record, pressed && styles.pressed]}
    >
      <View style={styles.recordIcon}>
        <Icon name={targetIcon(record.status.target)} size={20} color={colors.primary} />
      </View>
      <View style={styles.recordWords}>
        <Text style={styles.what} numberOfLines={1}>
          {line.what}
          <Text style={styles.time}> · {line.time}</Text>
        </Text>
        <Text style={styles.numbers}>{line.numbers}</Text>
      </View>
      <EndedChip ended={line.ended} />
      <Icon name="chevron" size={16} strokeWidth={2.2} color={CHEVRON} />
    </Pressable>
  );
}

export function HistoryScreen() {
  const now = useNow(30_000);
  const connected = useRobot((s) => s.connection.kind === 'connected');
  const currentMap = useRobot((s) => s.robotState?.value.currentMap ?? '');
  const list = useHistory((s) => s.list);
  // The job whose end the robot reports right now: a new one means a new record.
  const endedJob = useCleaning((s) => (s.status && ENDED_STATES.includes(s.status.value.state) ? s.status.value.jobId : 0));

  useFocusEffect(
    useCallback(() => {
      if (connected) void loadHistory();
    }, [connected]),
  );
  useEffect(() => {
    if (connected && endedJob !== 0 && useHistory.getState().list.state !== 'none') void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endedJob]);

  const history = list.history;
  const showNumbers = history !== null && history.totals.cleans > 0;
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusStrip />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.state === 'loading'} onRefresh={() => void loadHistory()} />}
      >
        <View style={styles.heading}>
          <Text style={styles.title} accessibilityRole="header">
            History
          </Text>
          <Text style={styles.subtitle}>{currentMap ? `All cleans on the map '${currentMap}'` : 'All cleans'}</Text>
        </View>

        {list.state === 'failed' ? (
          <Banner tone="warning" title="Couldn't get the history">
            <Text style={styles.bannerText}>{list.problem}</Text>
            <Text style={styles.bannerText}>Pull down to try again.</Text>
          </Banner>
        ) : null}

        <View style={styles.totals} accessible accessibilityLabel={history ? totalsText(history.totals) : undefined}>
          {showNumbers ? (
            totalsNumbers(history.totals).map((n, i) => (
              <View key={n.label} style={styles.total}>
                <Text style={[styles.totalValue, i === 0 && styles.totalValueFirst]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                  {n.value}
                </Text>
                <Text style={styles.totalLabel} numberOfLines={1}>
                  {n.label}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.totalsNote}>{history ? totalsText(history.totals) : list.state === 'loading' ? 'Loading…' : '-'}</Text>
          )}
        </View>

        {history && history.records.length === 0 ? <Text style={styles.empty}>No cleans yet. Start one on the Home tab with Clean.</Text> : null}
        {history
          ? historyDays(history.records, now).map((day, i) => (
              <View key={`${day.day} ${day.records[0].id}`} style={styles.day}>
                <Text style={[styles.dayTitle, i === 0 && styles.dayTitleFirst]} accessibilityRole="header" accessibilityLabel={day.day}>
                  {day.day.toUpperCase()}
                </Text>
                {day.records.map((record) => (
                  <RecordRow key={record.id} record={record} now={now} />
                ))}
              </View>
            ))
          : null}
        {history && history.records.length > 0 ? <Text style={styles.note}>The robot keeps its most recent cleans; the totals count every one.</Text> : null}
      </ScrollView>
      <RobotActionBar />
      <RecordDialog />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.l, paddingTop: 20, paddingBottom: 48 },
  heading: { paddingHorizontal: spacing.xs, marginBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.4, color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  bannerText: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  totals: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: 14,
    paddingHorizontal: spacing.s,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: LIGHT_EDGE,
    marginBottom: spacing.s,
  },
  total: { flex: 1, alignItems: 'center', gap: 1 },
  totalValue: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  totalValueFirst: { color: colors.primary },
  totalLabel: { fontSize: 12, color: colors.muted },
  totalsNote: { flex: 1, fontSize: 15, color: colors.muted, textAlign: 'center' },
  empty: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: spacing.l },
  day: { gap: 6 },
  dayTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.4, marginTop: 14, marginHorizontal: spacing.xs },
  dayTitleFirst: { marginTop: 10 },
  record: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: 10,
    paddingHorizontal: spacing.m,
    borderRadius: radius.l,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: LIGHT_EDGE,
  },
  pressed: { opacity: 0.7 },
  recordIcon: { width: 40, height: 40, borderRadius: radius.m, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  recordWords: { flex: 1, minWidth: 0, gap: 2 },
  what: { fontSize: 15, fontWeight: '700', color: colors.text },
  time: { fontWeight: '500', color: colors.muted },
  numbers: { fontSize: 13, color: colors.muted },
  note: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.m },
});
