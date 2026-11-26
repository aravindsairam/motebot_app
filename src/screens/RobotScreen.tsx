// The Robot tab, one long page. First any warning (connection lost, no news, failsafe with
// Reset), then the robot's settings (speeds, cleaning rows), then what the robot is doing, in
// detail: Now (its mode and faults), Safety (the safety gate), the connection; at the end a
// card for testing that switches the mode by hand, and Disconnect. Stop and Dock are in the bar
// at the bottom.
//
// Old data is never shown as current: when the connection is lost, or the robot has said nothing
// for 2 s, the content is greyed and labelled with its age.
//
// The app only asks. The robot decides every mode change, and when it refuses, the app shows the
// robot's own words.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { disconnect, lastHeard } from '../robot/client';
import { driverLabel, modeLook } from '../robot/modes';
import { isFresh, useRobot } from '../robot/store';
import { APP_VERSION } from '../version';
import { PROTOCOL_VERSION } from '../transport/messages';
import { ageText, Banner, Button, Card, Row, useNow } from '../ui/parts';
import { RobotActionBar, useRobotActions } from '../ui/RobotActions';
import { SettingsCard } from '../ui/SettingsCard';
import { StatusStrip } from '../ui/StatusStrip';
import { colors, fonts, radius, spacing } from '../ui/theme';

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

/** A row like parts.Row whose value is more than plain text. */
function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <View style={styles.lineValue}>{children}</View>
    </View>
  );
}

/** Text with a small round dot before it: green for all clear, red for trouble, grey when old. */
function Dotted({ text, dot, color, strong }: { text: string; dot: string; color?: string; strong?: boolean }) {
  return (
    <View style={styles.dotted}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[strong ? styles.tileValue : styles.value, color ? { color } : null]}>{text}</Text>
    </View>
  );
}

/** One of the safety gate's four sensors, on a light tile: its name, then Yes or No. */
function SensorTile({ label, set, live }: { label: string; set: boolean; live: boolean }) {
  return (
    <View style={styles.tile} accessible>
      <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
      <Dotted
        text={yesNo(set)}
        dot={live ? (set ? colors.danger : colors.good) : colors.faint}
        color={live && set ? colors.dangerText : undefined}
        strong
      />
    </View>
  );
}

export function RobotScreen() {
  const now = useNow();
  // One subscription per value shown. The time of the last message is NOT one of them: it changes
  // with every message, many times a second, so it is kept outside the store. The clock above
  // redraws the tab twice a second anyway, so it is read then.
  const address = useRobot((s) => s.address);
  const connection = useRobot((s) => s.connection);
  const hello = useRobot((s) => s.hello);
  const pingMs = useRobot((s) => s.pingMs);
  const robotState = useRobot((s) => s.robotState);
  const safety = useRobot((s) => s.safety);
  const heardAt = lastHeard();
  const connected = connection.kind === 'connected';
  const stateLive = connected && isFresh(robotState, now);
  const safetyLive = connected && isFresh(safety, now);
  const state = robotState?.value;
  const gate = safety?.value;
  const { controls, busy, reset, switchTo } = useRobotActions();
  const switchable = stateLive && state && !state.transitioning ? state.allowedTransitions.filter((m) => m !== state.state) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusStrip />
      <ScrollView contentContainerStyle={styles.content}>
        {!connected ? (
          <Banner tone="warning" title="Connection lost: reconnecting">
            <Text style={styles.bannerText}>
              {connection.kind === 'connecting'
                ? `Attempt ${connection.attempt}${connection.problem ? `. Last attempt: ${connection.problem}` : ''}.`
                : ''}
              {heardAt !== null ? ` Last message ${ageText(now - heardAt)}.` : ''}
            </Text>
            <Text style={styles.bannerText}>What is shown below is how the robot was then.</Text>
          </Banner>
        ) : null}

        {connected && state && !stateLive ? (
          <Banner tone="warning" title="No news from the robot">
            <Text style={styles.bannerText}>
              The PC is connected, but the robot's mode manager has said nothing since {ageText(now - robotState!.at)}.
            </Text>
          </Banner>
        ) : null}

        {stateLive && state?.state === 'failsafe' ? (
          <Banner tone="danger" title="Failsafe: the robot is stopped">
            <Text style={styles.bannerText}>{state.reason}</Text>
            {state.faults.map((fault) => (
              <Text key={fault} style={styles.bannerText}>• {fault}</Text>
            ))}
            <View style={styles.bannerButton}>
              <Button
                label={busy === 'reset' ? 'Resetting…' : 'Reset'}
                onPress={reset}
                disabled={!controls.reset.enabled || busy !== null}
              />
              {controls.reset.hint ? <Text style={styles.bannerHint}>{controls.reset.hint}</Text> : null}
            </View>
          </Banner>
        ) : null}

        <View style={styles.heading}>
          <Text style={styles.title} accessibilityRole="header">
            Robot
          </Text>
          <Text style={styles.subtitle}>Its settings, and what it is doing</Text>
        </View>

        <SettingsCard />

        <View style={stateLive ? null : styles.old}>
          <Card title="Now">
            {state ? (
              <>
                <Line label="Mode">
                  <Text style={[styles.value, styles.strong, stateLive ? { color: modeLook(state.state).color } : null]}>
                    {modeLook(state.state).label}
                  </Text>
                </Line>
                <Row label="Before that" value={state.previousState ? modeLook(state.previousState).label : '-'} />
                <Row label="Why" value={state.reason || '-'} />
                {state.transitioning ? <Row label="Now" value="Changing mode…" /> : null}
                <Row label="Map in use" value={state.currentMap || 'None yet'} />
                <Row
                  label="Can switch to"
                  value={state.allowedTransitions.length ? state.allowedTransitions.map((m) => modeLook(m).label).join(', ') : '-'}
                />
                <Line label="Faults">
                  {state.faults.length ? (
                    state.faults.map((fault) => (
                      <Text key={fault} style={[styles.value, styles.fault, { color: stateLive ? colors.dangerText : colors.muted }]}>
                        {state.faults.length > 1 ? `• ${fault}` : fault}
                      </Text>
                    ))
                  ) : (
                    <Dotted text="None" dot={stateLive ? colors.good : colors.faint} />
                  )}
                </Line>
                {!stateLive && robotState ? <Row label="As of" value={ageText(now - robotState.at)} /> : null}
              </>
            ) : (
              <Text style={styles.empty}>Waiting for the robot's mode manager…</Text>
            )}
          </Card>
        </View>

        <View style={safetyLive ? null : styles.old}>
          <Card title="Safety">
            {gate ? (
              <>
                <View style={styles.tiles}>
                  <View style={styles.tileRow}>
                    <SensorTile label="Cliff" set={gate.cliff} live={safetyLive} />
                    <SensorTile label="Bumper" set={gate.bumper} live={safetyLive} />
                  </View>
                  <View style={styles.tileRow}>
                    <SensorTile label="Off the floor" set={gate.offFloor} live={safetyLive} />
                    <SensorTile label="Backing away" set={gate.reflexActive} live={safetyLive} />
                  </View>
                </View>
                <View style={styles.afterTiles}>
                  <Row label="Who may drive" value={driverLabel(gate.source)} />
                  <Row label="Holding still" value={gate.blockedReason ? `Yes: ${gate.blockedReason}` : 'No'} />
                  <Row label="Inputs missing" value={gate.stale.length ? gate.stale.join(', ') : 'None'} />
                  {!safetyLive && safety ? <Row label="As of" value={ageText(now - safety.at)} /> : null}
                </View>
              </>
            ) : (
              <Text style={styles.empty}>Waiting for the safety gate…</Text>
            )}
          </Card>
        </View>

        <Card title="Connection">
          <Row label="PC" value={address ?? '-'} />
          <Row label="Robot" value={hello?.robotName ?? '-'} />
          <Row label="Last message" value={heardAt !== null ? ageText(now - heardAt) : '-'} />
          <Row label="Delay" value={connected && pingMs !== null ? `${pingMs} ms there and back` : '-'} />
          <Row label="Gateway" value={hello ? `version ${hello.gatewayVersion}` : '-'} />
          <Row label="App" value={`version ${APP_VERSION}, message format ${PROTOCOL_VERSION}`} />
        </Card>

        <View style={stateLive ? null : styles.old}>
          <View style={styles.testCard}>
            <Text style={styles.testTitle}>{'For testing: switch mode'.toUpperCase()}</Text>
            {switchable.length ? (
              <View style={styles.modes}>
                {switchable.map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    disabled={busy !== null}
                    onPress={() => switchTo(m)}
                    hitSlop={2}
                    style={({ pressed }) => [styles.mode, { borderColor: modeLook(m).color }, busy !== null && styles.modeBusy, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[styles.modeText, { color: modeLook(m).color }]}>{modeLook(m).label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>{state?.transitioning ? 'Changing mode…' : stateLive ? 'None right now' : '-'}</Text>
            )}
            <Text style={styles.modesNote}>The buttons on the Home tab do this for you.</Text>
          </View>
        </View>

        <Button label="Disconnect" kind="plain" onPress={disconnect} />
      </ScrollView>
      <RobotActionBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.l, paddingTop: 20, paddingBottom: 48 },
  old: { opacity: 0.45 },
  bannerText: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  bannerButton: { marginTop: spacing.m },
  bannerHint: { fontSize: 13, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
  heading: { paddingHorizontal: spacing.xs, marginBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.4, color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },
  empty: { fontSize: 15, color: colors.muted },
  // The same layout as parts.Row: label 120 wide, the value beside it.
  line: { flexDirection: 'row', paddingVertical: 5, gap: spacing.m },
  lineLabel: { width: 120, fontSize: 15, color: colors.muted },
  lineValue: { flex: 1 },
  value: { fontSize: 15, color: colors.text },
  strong: { fontWeight: '600' },
  fault: { paddingBottom: 2 },
  dotted: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tiles: { gap: spacing.s },
  tileRow: { flexDirection: 'row', gap: spacing.s },
  tile: { flex: 1, paddingVertical: 10, paddingHorizontal: spacing.m, borderRadius: radius.m, backgroundColor: colors.soft, gap: 2 },
  tileLabel: { fontSize: 12, color: colors.muted },
  tileValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  afterTiles: { marginTop: spacing.s },
  testCard: {
    borderRadius: radius.xl + 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.field,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  testTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, letterSpacing: 0.5, marginBottom: spacing.s + 2 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  mode: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: 20,
    backgroundColor: colors.card,
  },
  modeBusy: { opacity: 0.4 },
  modeText: { fontSize: 14, fontWeight: '700' },
  modesNote: { fontSize: 12, color: colors.muted, marginTop: spacing.s + 2 },
});
