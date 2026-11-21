// Choosing what to clean, at the bottom of the Home tab: Everything, an Area (dragged on the map),
// a Spot (tapped on the map) or a saved Plan; the options; Save plan; Start. The robot's preview
// (its rows on the map, its estimate here) follows every change, so what will happen is on the
// screen before anything moves. Stop stays below, as on every screen.

import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { dismissNotice, useActions } from '../robot/actionsStore';
import { closeChooser, chooseKind, choosePlan, deletePlan, loadPlans, savePlan, setOption, startClean } from '../robot/cleaning';
import { choiceHint, jobFor, planNameProblem } from '../robot/cleanChoice';
import { type ChoiceKind, type CleanOptions, useChoice } from '../robot/cleaningStore';
import { estimateText, targetLabel } from '../robot/cleaningText';
import type { CleaningPlanInfo } from '../transport/messages';
import { ActionBar, type BarButton } from './ActionBar';
import { NameDialog } from './NameDialog';
import { colors, spacing } from './theme';

const KINDS: { kind: ChoiceKind; label: string }[] = [
  { kind: 'everything', label: 'Everything' },
  { kind: 'area', label: 'Area' },
  { kind: 'spot', label: 'Spot' },
  { kind: 'plan', label: 'Plans' },
];

const PLAN_SUGGESTION: Record<ChoiceKind, string> = { everything: 'Whole home', area: 'My area', spot: 'My spot', plan: '' };

function optionsText(o: CleanOptions, plan: CleaningPlanInfo | null): string {
  const edges = plan ? plan.job.edges === 'on' : o.edges;
  const twice = plan ? plan.job.passes === 2 : o.twice;
  return [twice ? 'Twice' : 'Once', edges ? 'with the edges' : 'no edges', o.returnToDock ? 'then back to the dock' : 'then stays where it ends'].join(' · ');
}

function planSummary(p: CleaningPlanInfo): string {
  return `${targetLabel(p.job.what)} · ${estimateText(p.estimate)}`;
}

/** The panel above the buttons: what to clean, and what the robot says it will take. */
function ChooserPanel() {
  const choice = useChoice();
  const busy = useActions((s) => s.busy);
  const { kind, preview, plans, planName, options } = choice;
  const hint = choiceHint(choice);
  const chosenPlan = kind === 'plan' ? (plans.list.find((p) => p.name === planName) ?? null) : null;

  let line: { text: string; tone: 'muted' | 'good' | 'bad' };
  if (hint !== null) line = { text: hint, tone: 'muted' };
  else if (preview.state === 'refused') line = { text: `Can't clean this: ${preview.problem ?? 'the robot gave no reason'}`, tone: 'bad' };
  else if (preview.state === 'ready' && preview.estimate) line = { text: estimateText(preview.estimate), tone: 'good' };
  else line = { text: 'Working out the rows…', tone: 'muted' };

  function confirmDelete(name: string) {
    Alert.alert(`Delete '${name}'?`, 'The saved plan is removed from the robot.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deletePlan(name) },
    ]);
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>What to clean</Text>
        <Pressable onPress={closeChooser} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close without cleaning">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.segments}>
        {KINDS.map(({ kind: k, label }) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === k }}
            onPress={() => chooseKind(k)}
            style={[styles.segment, kind === k && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, kind === k && styles.segmentTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {kind === 'plan' ? (
        <View style={styles.plans}>
          {plans.state === 'loading' && plans.list.length === 0 ? <Text style={styles.muted}>Loading the saved plans…</Text> : null}
          {plans.state === 'failed' ? (
            <Pressable onPress={() => void loadPlans()} accessibilityRole="button">
              <Text style={styles.bad}>Couldn't load the plans: {plans.problem}. Tap to try again.</Text>
            </Pressable>
          ) : null}
          {plans.state === 'ready' && plans.list.length === 0 ? (
            <Text style={styles.muted}>No saved plans yet. Choose Everything, an Area or a Spot, then Save plan.</Text>
          ) : null}
          {plans.list.length > 0 ? (
            <ScrollView style={styles.planList} nestedScrollEnabled>
              {plans.list.map((p) => (
                <Pressable
                  key={p.name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: p.name === planName }}
                  onPress={() => choosePlan(p.name)}
                  style={[styles.plan, p.name === planName && styles.planOn]}
                >
                  <View style={styles.planWords}>
                    <Text style={styles.planName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.planInfo} numberOfLines={1}>
                      {planSummary(p)}
                    </Text>
                    {p.mapChanged ? <Text style={styles.planNote}>The map has changed since: its rows will be planned again.</Text> : null}
                  </View>
                  <Pressable
                    onPress={() => confirmDelete(p.name)}
                    disabled={busy !== null}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete the plan ${p.name}`}
                  >
                    <Text style={[styles.delete, busy !== null && styles.muted]}>{busy === 'delete_plan' ? 'Deleting…' : 'Delete'}</Text>
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.line, line.tone === 'good' ? styles.good : line.tone === 'bad' ? styles.bad : styles.muted]}>{line.text}</Text>
      {preview.state === 'ready' && preview.replanned ? (
        <Text style={styles.muted}>The map has changed since this plan was saved, so its rows were planned again.</Text>
      ) : null}
      <Text style={styles.options}>{optionsText(options, chosenPlan)}</Text>
    </View>
  );
}

/** The switches. A saved plan keeps the area, edges and passes it was saved with. */
function OptionsDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { kind, options, plans, planName } = useChoice();
  const plan = kind === 'plan' ? (plans.list.find((p) => p.name === planName) ?? null) : null;
  const fixed = kind === 'plan';
  const rows: { key: keyof CleanOptions; title: string; text: string; value: boolean; locked: boolean }[] = [
    {
      key: 'edges',
      title: 'Clean along the edges',
      text: 'After the rows, a pass along walls and furniture.',
      value: plan ? plan.job.edges === 'on' : options.edges,
      locked: fixed,
    },
    {
      key: 'twice',
      title: 'Clean twice',
      text: 'A second time, crosswise. Takes about twice as long.',
      value: plan ? plan.job.passes === 2 : options.twice,
      locked: fixed,
    },
    {
      key: 'returnToDock',
      title: 'Go back to the dock',
      text: 'When the clean is done. Off: the robot stays where it ends.',
      value: options.returnToDock,
      locked: false,
    },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Options</Text>
          {rows.map((r) => (
            <View key={r.key} style={styles.option}>
              <View style={styles.optionWords}>
                <Text style={[styles.optionTitle, r.locked && styles.muted]}>{r.title}</Text>
                <Text style={styles.optionText}>{r.text}</Text>
              </View>
              <Switch
                value={r.value}
                disabled={r.locked}
                onValueChange={(v) => setOption(r.key, v)}
                trackColor={{ true: colors.cleaning, false: colors.border }}
                accessibilityLabel={r.title}
              />
            </View>
          ))}
          {fixed ? <Text style={styles.optionText}>A saved plan keeps the edges and passes it was saved with.</Text> : null}
          <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** The Home tab's bar while choosing: the panel, Options, Save plan, Start, and Stop. */
export function CleanChooserBar({
  cleanable,
  connected,
  stop,
}: {
  cleanable: { enabled: boolean; hint: string | null }; // the robot can take a clean now
  connected: boolean;
  stop: { enabled: boolean; label: string; onPress: () => void };
}) {
  const choice = useChoice();
  const { busy, notice } = useActions();
  const [showOptions, setShowOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const ready = jobFor(choice) !== null && choice.preview.state === 'ready';

  const buttons: BarButton[] = [
    { key: 'options', label: 'Options', enabled: busy === null, hint: null, onPress: () => setShowOptions(true) },
    {
      key: 'save',
      label: busy === 'save_plan' ? 'Saving…' : 'Save plan',
      enabled: choice.kind !== 'plan' && ready && connected && busy === null,
      hint: null,
      onPress: () => setSaving(true),
    },
    {
      key: 'start',
      label: busy === 'clean' ? 'Starting…' : 'Start',
      enabled: cleanable.enabled && ready && busy === null,
      hint: cleanable.enabled ? null : cleanable.hint,
      onPress: () => void startClean(),
      primary: true,
    },
  ];

  return (
    <>
      <OptionsDialog visible={showOptions} onClose={() => setShowOptions(false)} />
      <NameDialog
        visible={saving}
        title="Save as a plan"
        suggestion={PLAN_SUGGESTION[choice.kind]}
        help="Clean it again later from Plans."
        backLabel="Cancel"
        what="plan"
        autoCapitalize="sentences"
        problemOf={planNameProblem}
        save={savePlan}
        onClose={() => setSaving(false)}
      />
      <ActionBar buttons={buttons} stop={stop} notice={notice} onDismiss={dismissNotice} banner={<ChooserPanel />} />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: spacing.s },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.muted, paddingHorizontal: spacing.xs },
  segments: { flexDirection: 'row', borderWidth: 1, borderColor: colors.cleaning, borderRadius: 10, overflow: 'hidden' },
  segment: { flex: 1, height: 38, justifyContent: 'center', alignItems: 'center' },
  segmentOn: { backgroundColor: colors.cleaning },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.cleaning },
  segmentTextOn: { color: '#ffffff' },
  plans: { marginTop: spacing.s },
  planList: { maxHeight: 150 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    marginBottom: spacing.xs,
  },
  planOn: { borderColor: colors.cleaning, backgroundColor: colors.cleaningBackground },
  planWords: { flex: 1, marginRight: spacing.s },
  planName: { fontSize: 15, fontWeight: '600', color: colors.text },
  planInfo: { fontSize: 13, color: colors.muted },
  planNote: { fontSize: 12, color: colors.warning },
  delete: { fontSize: 14, fontWeight: '600', color: colors.danger },
  line: { fontSize: 14, marginTop: spacing.s },
  muted: { fontSize: 13, color: colors.muted },
  good: { fontWeight: '600', color: colors.text },
  bad: { fontSize: 14, color: colors.danger },
  options: { fontSize: 12, color: colors.muted, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.card, borderRadius: 14, padding: spacing.l },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.s },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.s },
  optionWords: { flex: 1, marginRight: spacing.m },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionText: { fontSize: 13, color: colors.muted },
  done: { marginTop: spacing.l, height: 46, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  doneText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});
