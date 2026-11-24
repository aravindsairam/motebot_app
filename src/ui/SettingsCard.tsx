// The Settings card on the Robot tab: how fast the robot cleans, how fast the joystick drives it,
// how far apart the cleaning rows are and which way they run. The robot keeps the settings: the
// card shows what the robot reports and asks it to change them. A tap shows at once; when the
// robot says no, the value goes back and the message card above the buttons says why.
//
// One setting per row, with a thin line between rows. Each value has a round minus and plus
// button. The row direction has an Auto switch; with Auto off a second row shows a small drawing
// of rows at that angle, turned the way they will look on the map, and the angle. Everything is
// greyed while there is no connection or the robot has not sent its settings yet.

import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { setRowAngleAuto, stepRowAngle, stepSetting } from '../robot/settings';
import { useSettings } from '../robot/settingsStore';
import { shownSettings } from '../robot/settingsSync';
import { settingsView, type StepperView } from '../robot/settingsView';
import { useRobot } from '../robot/store';
import { Card } from './parts';
import { colors, fonts, radius, spacing } from './theme';

// Sizes on screen. On the narrowest phone checked (360 wide, text at 1.3 times) a row has 296
// across: the stepper takes 178 of it and the label the rest. Text that still does not fit
// shrinks, as on the other screens.
const BUTTON = 44; // the round minus and plus buttons
const VALUE_WIDTH = 82; // between them: room for "0.20 m/s"
const DRAWING_WIDTH = 76; // the drawing of the rows
const DRAWING_HEIGHT = 52;
// The lines are drawn on a square as wide as the drawing's diagonal, turned about its middle, so
// they reach the edges at any angle. 8 lines on it are about 10 apart.
const DRAWING_SQUARE = Math.ceil(Math.hypot(DRAWING_WIDTH, DRAWING_HEIGHT));
const ROWS_DRAWN = [0, 1, 2, 3, 4, 5, 6, 7];

const WHITE = '#ffffff';
const STEP_OFF_FILL = '#f5f7f6'; // a minus or plus that cannot be used
const STEP_OFF_SIGN = '#b5bfbc';

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

/** A few level lines in a rounded box, turned to the rows' angle. */
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
        <View style={[styles.row, styles.divided]}>
          <Label text="Cleaning speed" />
          <Stepper name="cleaning speed" view={view.cleaningSpeed} onStep={(d) => stepSetting('cleaningSpeed', d)} />
        </View>
        <View style={[styles.row, styles.divided]}>
          <Label text="Joystick speed" />
          <Stepper name="joystick speed" view={view.manualSpeed} onStep={(d) => stepSetting('manualSpeed', d)} />
        </View>
        <View style={[styles.row, styles.divided]}>
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
            trackColor={{ true: colors.primary, false: colors.field }}
            thumbColor={WHITE}
            accessibilityLabel="Row direction: automatic"
          />
        </View>
        {view.rowAngle ? (
          <View style={styles.angleRow}>
            <View style={styles.drawingColumn}>
              <RowsDrawing turn={view.rowsTurn} />
              <Text style={styles.caption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                As on the map
              </Text>
            </View>
            <View style={styles.spacer} />
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
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 10 },
  divided: { borderBottomWidth: 1, borderBottomColor: colors.line },
  label: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  step: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepOff: { backgroundColor: STEP_OFF_FILL },
  stepText: { fontSize: 22, lineHeight: 26, fontWeight: '600', color: colors.primary },
  stepTextOff: { color: STEP_OFF_SIGN },
  pressed: { opacity: 0.7 },
  value: {
    width: VALUE_WIDTH,
    textAlign: 'center',
    fontSize: 17,
    fontFamily: fonts.display,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  auto: { fontSize: 14, color: colors.muted },
  angleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, paddingTop: spacing.xs, paddingBottom: 2 },
  drawingColumn: { width: DRAWING_WIDTH, alignItems: 'center', gap: 2 },
  drawing: {
    width: DRAWING_WIDTH,
    height: DRAWING_HEIGHT,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  rows: {
    position: 'absolute',
    width: DRAWING_SQUARE,
    height: DRAWING_SQUARE,
    left: (DRAWING_WIDTH - DRAWING_SQUARE) / 2,
    top: (DRAWING_HEIGHT - DRAWING_SQUARE) / 2,
    justifyContent: 'space-evenly',
  },
  rowLine: { height: 2.5, borderRadius: radius.pill, backgroundColor: colors.primary },
  caption: { fontSize: 12, color: colors.muted },
  spacer: { flex: 1 },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.s },
});
