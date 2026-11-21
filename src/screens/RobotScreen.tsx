// The Robot tab: what the robot is doing, in detail: mode, faults, the safety gate, the
// connection; with Stop and Dock at the bottom and Reset when the robot is in failsafe.
//
// Old data is never shown as current: when the connection is lost, or the robot has said nothing
// for 2 s, the content is greyed and labelled with its age.
//
// The app only asks. The robot decides every mode change, and when it refuses, the app shows the
// robot's own words.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { disconnect } from '../robot/client';
import { driverLabel, modeLook } from '../robot/modes';
import { isFresh, useRobot } from '../robot/store';
import { APP_VERSION } from '../version';
import { PROTOCOL_VERSION } from '../transport/messages';
import { ageText, Banner, Button, Card, Row, useNow } from '../ui/parts';
import { RobotActionBar, useRobotActions } from '../ui/RobotActions';
import { StatusStrip } from '../ui/StatusStrip';
import { colors, spacing } from '../ui/theme';

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

export function RobotScreen() {
  const now = useNow();
  const { address, connection, hello, heardAt, pingMs, robotState, safety } = useRobot();
  const connected = connection.kind === 'connected';
  const stateLive = connected && isFresh(robotState, now);
  const safetyLive = connected && isFresh(safety, now);
  const state = robotState?.value;
  const gate = safety?.value;
  const { controls, busy, reset, switchTo } = useRobotActions();
  const switchable = stateLive && state && !state.transitioning ? state.allowedTransitions.filter((m) => m !== state.state) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
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

        <View style={stateLive ? null : styles.old}>
          <Card title="Mode">
            {state ? (
              <>
                <Row label="Mode" value={modeLook(state.state).label} color={stateLive ? modeLook(state.state).color : undefined} />
                <Row label="Before that" value={state.previousState ? modeLook(state.previousState).label : '-'} />
                <Row label="Why" value={state.reason || '-'} />
                {state.transitioning ? <Row label="Now" value="Changing mode…" /> : null}
                <Row label="Map in use" value={state.currentMap || 'None yet'} />
                <Row
                  label="Can switch to"
                  value={state.allowedTransitions.length ? state.allowedTransitions.map((m) => modeLook(m).label).join(', ') : '-'}
                />
                {!stateLive && robotState ? <Row label="As of" value={ageText(now - robotState.at)} /> : null}
              </>
            ) : (
              <Text style={styles.empty}>Waiting for the robot's mode manager…</Text>
            )}
          </Card>

          <Card title="Switch mode">
            {switchable.length ? (
              <View style={styles.modes}>
                {switchable.map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    disabled={busy !== null}
                    onPress={() => switchTo(m)}
                    style={({ pressed }) => [styles.mode, { borderColor: modeLook(m).color }, busy !== null && styles.modeBusy, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[styles.modeText, { color: modeLook(m).color }]}>{modeLook(m).label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>{state?.transitioning ? 'Changing mode…' : stateLive ? 'None right now' : '-'}</Text>
            )}
            <Text style={styles.modesNote}>For testing. The buttons on the Home tab do this for you.</Text>
          </Card>

          <Card title="Faults">
            {state ? (
              state.faults.length ? (
                state.faults.map((fault) => (
                  <Text key={fault} style={[styles.fault, stateLive ? null : { color: colors.muted }]}>• {fault}</Text>
                ))
              ) : (
                <Text style={styles.empty}>None</Text>
              )
            ) : (
              <Text style={styles.empty}>-</Text>
            )}
          </Card>
        </View>

        <View style={safetyLive ? null : styles.old}>
          <Card title="Safety gate">
            {gate ? (
              <>
                <Row label="Who may drive" value={driverLabel(gate.source)} />
                <Row label="Holding still" value={gate.blockedReason ? `Yes: ${gate.blockedReason}` : 'No'} />
                <Row label="Cliff" value={yesNo(gate.cliff)} color={gate.cliff && safetyLive ? colors.danger : undefined} />
                <Row label="Bumper" value={yesNo(gate.bumper)} color={gate.bumper && safetyLive ? colors.danger : undefined} />
                <Row label="Off the floor" value={yesNo(gate.offFloor)} color={gate.offFloor && safetyLive ? colors.danger : undefined} />
                <Row label="Backing away" value={yesNo(gate.reflexActive)} />
                <Row label="Inputs missing" value={gate.stale.length ? gate.stale.join(', ') : 'None'} />
                {!safetyLive && safety ? <Row label="As of" value={ageText(now - safety.at)} /> : null}
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

        <Button label="Disconnect" kind="plain" onPress={disconnect} />
      </ScrollView>
      <RobotActionBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.l, paddingBottom: 48 },
  old: { opacity: 0.45 },
  bannerText: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  bannerButton: { marginTop: spacing.m },
  bannerHint: { fontSize: 13, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
  empty: { fontSize: 15, color: colors.muted },
  fault: { fontSize: 15, color: colors.danger, paddingVertical: 2 },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s },
  mode: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: spacing.m, paddingVertical: spacing.s },
  modeBusy: { opacity: 0.4 },
  modeText: { fontSize: 14, fontWeight: '700' },
  modesNote: { fontSize: 12, color: colors.muted, marginTop: spacing.s },
});
