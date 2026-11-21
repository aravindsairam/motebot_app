// The History tab: every clean the robot has recorded on this map, newest first, with the totals
// at the top. Tap one to see its numbers and the robot's picture of it. Pull down to ask again;
// the list is also asked for when the tab is shown and when a clean ends.
//
// The robot keeps the history (its most recent cleans, and totals over every clean ever); the
// app only shows it.

import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCleaning } from '../robot/cleaningStore';
import { ENDED_STATES, historyLine, totalsText } from '../robot/cleaningText';
import { loadHistory, openRecord } from '../robot/history';
import { useHistory } from '../robot/historyStore';
import { useRobot } from '../robot/store';
import { Banner, Card, useNow } from '../ui/parts';
import { RecordDialog } from '../ui/RecordDialog';
import { RobotActionBar } from '../ui/RobotActions';
import { StatusStrip } from '../ui/StatusStrip';
import { colors, spacing } from '../ui/theme';

const ENDED_COLORS: Record<string, string> = { done: colors.good, stopped: colors.warning, failed: colors.danger };

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
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusStrip />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.state === 'loading'} onRefresh={() => void loadHistory()} />}
      >
        {list.state === 'failed' ? (
          <Banner tone="warning" title="Couldn't get the history">
            <Text style={styles.bannerText}>{list.problem}</Text>
            <Text style={styles.bannerText}>Pull down to try again.</Text>
          </Banner>
        ) : null}

        <Card title={currentMap ? `All cleans on the map '${currentMap}'` : 'All cleans'}>
          <Text style={styles.totals}>{history ? totalsText(history.totals) : list.state === 'loading' ? 'Loading…' : '-'}</Text>
        </Card>

        {history && history.records.length === 0 ? <Text style={styles.empty}>No cleans yet. Start one on the Home tab with Clean.</Text> : null}
        {history?.records.map((record) => {
          const line = historyLine(record, now);
          return (
            <Pressable
              key={record.id}
              accessibilityRole="button"
              onPress={() => void openRecord(record.id)}
              style={({ pressed }) => [styles.record, pressed && styles.pressed]}
            >
              <View style={styles.recordTop}>
                <Text style={styles.when}>{line.when}</Text>
                <Text style={styles.what} numberOfLines={1}>
                  {line.what}
                </Text>
              </View>
              <View style={styles.recordBottom}>
                <Text style={styles.numbers}>{line.numbers}</Text>
                <Text style={[styles.ended, { color: ENDED_COLORS[line.ended] ?? colors.muted }]}>{line.ended}</Text>
              </View>
            </Pressable>
          );
        })}
        {history && history.records.length > 0 ? <Text style={styles.note}>The robot keeps its most recent cleans; the totals count every one.</Text> : null}
      </ScrollView>
      <RobotActionBar />
      <RecordDialog />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.l, paddingBottom: 48 },
  bannerText: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  totals: { fontSize: 16, fontWeight: '600', color: colors.text },
  empty: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: spacing.l },
  record: { backgroundColor: colors.card, borderRadius: 10, padding: spacing.m, marginBottom: spacing.s },
  pressed: { opacity: 0.7 },
  recordTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.m },
  when: { fontSize: 15, fontWeight: '600', color: colors.text },
  what: { flex: 1, fontSize: 15, color: colors.text },
  recordBottom: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  numbers: { flex: 1, fontSize: 14, color: colors.muted },
  ended: { fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.m },
});
