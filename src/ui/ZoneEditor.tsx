// Changing the no-go zones, at the bottom of the Home tab while the map shows them for editing:
// what is selected and how big it is, Add, Delete, Cancel and Save. Nothing changes on the robot
// until Save; the robot's answer (or its reason for refusing) shows here. Stop stays below, as on
// every screen.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dismissNotice, useActions } from '../robot/actionsStore';
import { useRobot } from '../robot/store';
import { closeZoneEditor, deleteSelectedZone, sameZones, saveZones, startAddingZone, useZoneEdit, zoneBox } from '../robot/zones';
import { ActionBar, type BarButton } from './ActionBar';
import { colors, spacing } from './theme';

function zonesCount(n: number): string {
  return n === 0 ? 'No no-go zones' : n === 1 ? 'One no-go zone' : `${n} no-go zones`;
}

function ZonePanel() {
  const z = useZoneEdit();
  const selected = z.selected !== null ? z.draft[z.selected] : null;
  const box = selected ? zoneBox(selected.points) : null;

  let line: { text: string; tone: 'muted' | 'bad' };
  if (z.problem) line = { text: `Not saved: ${z.problem}`, tone: 'bad' };
  else if (z.saving) line = { text: 'Saving the zones on the robot…', tone: 'muted' };
  else if (z.adding) line = { text: 'Tap the map to place a 1 m square, or drag to draw the zone.', tone: 'muted' };
  else if (selected && box) line = { text: `${selected.name}: ${(box.x1 - box.x0).toFixed(2)} × ${(box.y1 - box.y0).toFixed(2)} m`, tone: 'muted' };
  else if (selected) line = { text: `${selected.name}: this shape can only be deleted here.`, tone: 'muted' };
  else line = { text: `${zonesCount(z.draft.length)}. Tap one to change it, or Add.`, tone: 'muted' };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          No-go zones · {z.mapName}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close without saving" onPress={closeZoneEditor} hitSlop={10} disabled={z.saving}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <Text style={[styles.line, line.tone === 'bad' && styles.bad]}>{line.text}</Text>
    </View>
  );
}

export function ZoneEditorBar({ stop }: { stop: { enabled: boolean; label: string; onPress: () => void } }) {
  const z = useZoneEdit();
  const notice = useActions((s) => s.notice);
  const robotZones = useRobot((s) => s.zones);
  const edited = !robotZones || !sameZones(z.draft, robotZones.value.zones);

  const buttons: BarButton[] = [
    { key: 'add', label: 'Add', enabled: !z.saving, hint: null, onPress: startAddingZone, active: z.adding },
    { key: 'delete', label: 'Delete', enabled: z.selected !== null && !z.saving, hint: null, onPress: deleteSelectedZone },
    { key: 'cancel', label: 'Cancel', enabled: !z.saving, hint: null, onPress: closeZoneEditor },
    { key: 'save', label: z.saving ? 'Saving…' : 'Save', enabled: edited && !z.saving, hint: null, onPress: () => void saveZones(), primary: true },
  ];
  return <ActionBar buttons={buttons} stop={stop} notice={notice} onDismiss={dismissNotice} banner={<ZonePanel />} />;
}

const styles = StyleSheet.create({
  panel: { marginBottom: spacing.s },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.muted, paddingHorizontal: spacing.xs },
  line: { fontSize: 14, color: colors.muted },
  bad: { color: colors.danger },
});
