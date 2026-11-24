// The strip at the top of every screen once connected: the connection, the robot's name, its
// mode, and the one line most worth knowing about what it is doing.

import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCleaning } from '../robot/cleaningStore';
import { progressText, RUNNING_STATES } from '../robot/cleaningText';
import { useExploring } from '../robot/exploringStore';
import { explorationLine, RUNNING_EXPLORATION } from '../robot/exploringText';
import { modeLook } from '../robot/modes';
import { isFresh, useRobot } from '../robot/store';
import { tripView } from '../robot/tripView';
import { Chip, useNow } from './parts';
import { colors, fonts, spacing } from './theme';

export function StatusStrip() {
  const now = useNow();
  const insets = useSafeAreaInsets();
  const connection = useRobot((s) => s.connection);
  const hello = useRobot((s) => s.hello);
  const robotState = useRobot((s) => s.robotState);
  const navigation = useRobot((s) => s.navigation);
  const cleaning = useCleaning((s) => s.status);
  const exploring = useExploring((s) => s.status);
  const connected = connection.kind === 'connected';
  const live = connected && isFresh(robotState, now);
  const state = robotState?.value;
  const look = modeLook(state?.state ?? '');

  let detail = '';
  if (!connected) detail = 'Reconnecting…';
  else if (!state) detail = 'Waiting for the robot…';
  else if (!live) detail = 'No news from the robot';
  else if (state.transitioning) detail = state.reason || 'Changing mode…';
  else if (isFresh(cleaning, now) && cleaning && RUNNING_STATES.includes(cleaning.value.state)) detail = progressText(cleaning.value);
  else if (isFresh(exploring, now) && exploring && RUNNING_EXPLORATION.includes(exploring.value.state)) detail = explorationLine(exploring.value);
  else detail = tripView(navigation, state.state, now).text ?? state.reason;

  return (
    <View style={[styles.strip, { paddingTop: TOP_PADDING + insets.top }]}>
      <View style={styles.line}>
        <View style={[styles.dot, { backgroundColor: live ? colors.good : connected ? colors.warning : colors.danger }]} />
        <Text style={styles.name} numberOfLines={1}>
          {hello?.robotName ?? 'Robot'}
        </Text>
        {state ? (
          <Chip
            label={look.label.toUpperCase()}
            color={live ? look.color : colors.muted}
            background={live ? look.background : colors.line}
            strong={live && state.state === 'failsafe'}
          />
        ) : null}
      </View>
      <Text style={styles.detail} numberOfLines={2}>
        {detail}
      </Text>
    </View>
  );
}

const TOP_PADDING = 14; // below the phone's own top bar, which the strip reaches up behind (white like it)

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, fontSize: 21, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.2 },
  detail: { fontSize: 14, color: colors.muted, marginTop: spacing.xs },
});
