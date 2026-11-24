// Changing the no-go zones, at the bottom of the Home tab while the map shows them for editing:
// what is selected and how big it is, Add, Delete, Cancel and Save. Nothing changes on the robot
// until Save; the robot's answer (or its reason for refusing) shows here. Stop stays below, as on
// every screen.
//
// The zone picked on the map shows as a small orange card (its name, its size, how to change it);
// with none picked, a line says how many zones there are.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dismissNotice, useActions } from '../robot/actionsStore';
import { useRobot } from '../robot/store';
import { closeZoneEditor, deleteSelectedZone, sameZones, saveZones, startAddingZone, useZoneEdit, zoneBox } from '../robot/zones';
import { ActionBar, type BarButton } from './ActionBar';
import { Icon } from './icons';
import { colors, fonts, radius, spacing } from './theme';

const ZONE_EDGE = '#f4cdb6'; // the edge of the picked zone's card: a light orange
const ZONE_FILL = 'rgba(217,72,15,0.22)'; // inside the swatch, as a zone is filled on the map

function zonesCount(n: number): string {
  return n === 0 ? 'No no-go zones' : n === 1 ? 'One no-go zone' : `${n} no-go zones`;
}

function ZonePanel() {
  const z = useZoneEdit();
  const selected = z.selected !== null ? z.draft[z.selected] : null;
  const box = selected ? zoneBox(selected.points) : null;

  // The picked zone has its own card; this line says the rest.
  let line: { text: string; tone: 'muted' | 'bad' } | null;
  if (z.problem) line = { text: `Not saved: ${z.problem}`, tone: 'bad' };
  else if (z.saving) line = { text: 'Saving the zones on the robot…', tone: 'muted' };
  else if (z.adding) line = { text: 'Tap the map to place a 1 m square, or drag to draw the zone.', tone: 'muted' };
  else if (selected) line = null;
  else line = { text: `${zonesCount(z.draft.length)}. Tap one to change it, or Add.`, tone: 'muted' };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          No-go zones<Text style={styles.titleMap}>{` · ${z.mapName}`}</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close without saving"
          onPress={closeZoneEditor}
          disabled={z.saving}
          style={[styles.close, z.saving && styles.off]}
        >
          <Icon name="close" size={18} color={colors.muted} strokeWidth={2.2} />
        </Pressable>
      </View>
      {selected ? (
        <View style={styles.zone}>
          <View style={styles.swatch} />
          <View style={styles.zoneWords}>
            <Text style={styles.zoneName} numberOfLines={1}>
              {selected.name}
              {box ? <Text style={styles.zoneSize}>{` · ${(box.x1 - box.x0).toFixed(2)} × ${(box.y1 - box.y0).toFixed(2)} m`}</Text> : null}
            </Text>
            <Text style={styles.zoneHint}>{box ? 'Drag a corner to resize it, the middle to move it.' : 'This shape can only be deleted here.'}</Text>
          </View>
        </View>
      ) : null}
      {line ? <Text style={[styles.line, line.tone === 'bad' && styles.bad]}>{line.text}</Text> : null}
    </View>
  );
}

export function ZoneEditorBar({ stop }: { stop: { enabled: boolean; label: string; onPress: () => void } }) {
  const z = useZoneEdit();
  const notice = useActions((s) => s.notice);
  const robotZones = useRobot((s) => s.zones);
  const edited = !robotZones || !sameZones(z.draft, robotZones.value.zones);

  const buttons: BarButton[] = [
    { key: 'add', icon: 'plus', label: 'Add', enabled: !z.saving, hint: null, onPress: startAddingZone, active: z.adding },
    { key: 'delete', icon: 'trash', label: 'Delete', enabled: z.selected !== null && !z.saving, hint: null, onPress: deleteSelectedZone, danger: true },
    { key: 'cancel', label: 'Cancel', enabled: !z.saving, hint: null, onPress: closeZoneEditor },
    { key: 'save', label: z.saving ? 'Saving…' : 'Save', enabled: edited && !z.saving, hint: null, onPress: () => void saveZones(), primary: true },
  ];
  return <ActionBar buttons={buttons} stop={stop} notice={notice} onDismiss={dismissNotice} banner={<ZonePanel />} />;
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 19, color: colors.text },
  titleMap: { fontFamily: fonts.displayMedium, color: colors.muted },
  close: { width: 44, height: 44, marginVertical: -8, marginRight: -10, justifyContent: 'center', alignItems: 'center' },
  off: { opacity: 0.4 },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: 10,
    paddingHorizontal: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: ZONE_EDGE,
    backgroundColor: colors.zoneBackground,
  },
  swatch: { width: 28, height: 28, borderRadius: radius.s, borderWidth: 2, borderColor: colors.zone, backgroundColor: ZONE_FILL },
  zoneWords: { flex: 1, gap: 2 },
  zoneName: { fontSize: 15, fontWeight: '700', color: colors.text },
  zoneSize: { fontWeight: '500', color: colors.muted },
  zoneHint: { fontSize: 13, color: colors.muted },
  line: { fontSize: 14, color: colors.muted },
  bad: { color: colors.dangerText },
});
