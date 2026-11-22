// The Settings card on the Robot tab: how fast the robot cleans, how fast the joystick drives it,
// how far apart the cleaning rows are and which way they run. The robot keeps the settings: the
// card shows what the robot reports and asks it to change them. A tap shows at once; when the
// robot says no, the value goes back and the message card above the buttons says why.
//
// Each value has a minus and a plus button. The row direction has an Auto switch; with Auto off
// it has an angle, and a small drawing of rows at that angle, turned the way they will look on
// the map. Everything is greyed while there is no connection or the robot has not sent its
// settings yet.

import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { setRowAngleAuto, stepRowAngle, stepSetting } from '../robot/settings';
import { useSettings } from '../robot/settingsStore';
import { shownSettings } from '../robot/settingsSync';
import { settingsView, type StepperView } from '../robot/settingsView';
import { useRobot } from '../robot/store';
import { Card } from './parts';
import { colors, spacing } from './theme';

// Sizes on screen. On the narrowest phone checked (360 wide, text at 1.3 times) a row has 296
// across: the stepper takes 168 of it and the label the rest. Text that still does not fit
// shrinks, as on the other screens.
const BUTTON = 40; // the minus and plus buttons
const VALUE_WIDTH = 80; // between them: room for "0.20 m/s"
const DRAWING = 44; // the drawing of the rows
const ROWS_DRAWN = [0, 1, 2, 3];

function StepButton({ sign, label, enabled, onPress }: { sign: string; label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.step, !enabled && styles.stepOff, pressed && enabled && styles.pressed]}
    >
      <Text style={[styles.stepText, !enabled && styles.stepTextOff]}>{sign}</Text>
    </Pressable>
  );
}

/** Minus, the value, plus. `name` says what it changes, for a screen reader. */
function Stepper({ name, view, onStep }: { name: string; view: StepperView; onStep: (direction: 1 | -1) => void }) {
  return (
    <View style={styles.stepper}>
      <StepButton sign="−" label={`Decrease ${name}`} enabled={view.less} onPress={() => onStep(-1)} />
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {view.text}
      </Text>
      <StepButton sign="+" label={`Increase ${name}`} enabled={view.more} onPress={() => onStep(1)} />
    </View>
  );
}

function Label({ text }: { text: string }) {
  return (
    <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {text}
    </Text>
  );
}

/** A few level lines in a circle, turned to the rows' angle. */
function RowsDrawing({ turn }: { turn: number }) {
  return (
    <View style={styles.drawing} importantForAccessibility="no-hide-descendants">
      <View style={[styles.rows, { transform: [{ rotate: `${turn}deg` }] }]}>
        {ROWS_DRAWN.map((i) => (
          <View key={i} style={styles.rowLine} />
        ))}
      </View>
    </View>
  );
}

export function SettingsCard() {
  const connected = useRobot((s) => s.connection.kind === 'connected');
  const limits = useRobot((s) => s.settings?.value.limits ?? null);
  const sync = useSettings();
  const view = settingsView(shownSettings(sync), limits, connected);

  return (
    <Card title="Settings">
      <View style={view.enabled ? null : styles.off}>
        <View style={styles.row}>
          <Label text="Cleaning speed" />
          <Stepper name="cleaning speed" view={view.cleaningSpeed} onStep={(d) => stepSetting('cleaningSpeed', d)} />
        </View>
        <View style={styles.row}>
          <Label text="Joystick speed" />
          <Stepper name="joystick speed" view={view.manualSpeed} onStep={(d) => stepSetting('manualSpeed', d)} />
        </View>
        <View style={styles.row}>
          <Label text="Row spacing" />
          <Stepper name="row spacing" view={view.rowSpacing} onStep={(d) => stepSetting('rowSpacing', d)} />
        </View>
        <View style={styles.row}>
          <Label text="Row direction" />
          <Text style={styles.auto}>Auto</Text>
          <Switch
            value={view.rowAngleAuto}
            disabled={!view.enabled}
            onValueChange={setRowAngleAuto}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Row direction: automatic"
          />
        </View>
        {view.rowAngle ? (
          <View style={styles.row}>
            <RowsDrawing turn={view.rowsTurn} />
            <Text style={styles.caption} numberOfLines={2}>
              As on the map
            </Text>
            <Stepper name="row angle" view={view.rowAngle} onStep={stepRowAngle} />
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>
        {view.known
          ? 'Row spacing and direction are used from the next clean. Cleaning speed changes at once, even during a clean.'
          : "Waiting for the robot's settings…"}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  off: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: spacing.s },
  label: { flex: 1, fontSize: 14, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  step: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepOff: { borderColor: colors.border },
  stepText: { fontSize: 20, lineHeight: 24, fontWeight: '600', color: colors.primary },
  stepTextOff: { color: colors.muted },
  pressed: { opacity: 0.7 },
  value: { width: VALUE_WIDTH, textAlign: 'center', fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  auto: { fontSize: 14, color: colors.muted },
  drawing: {
    width: DRAWING,
    height: DRAWING,
    borderRadius: DRAWING / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cleaningBackground,
    overflow: 'hidden',
  },
  // A square as wide as the circle, turned about its middle: its lines reach the rim at any angle.
  rows: { flex: 1, justifyContent: 'space-evenly' },
  rowLine: { height: 3, borderRadius: 1.5, backgroundColor: colors.cleaning },
  caption: { flex: 1, fontSize: 12, color: colors.muted },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.s },
});
