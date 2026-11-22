// Changing the rooms, at the bottom of the Home tab while the map shows them for editing: Find
// rooms and Name by looking, what is going on, the rooms with their areas (tap one to rename it,
// Delete to take it off the list), Cancel and Save. Nothing changes on the robot until Save; when
// the robot says no, the message card says why. Stop stays below, as on every screen.

import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { dismissNotice, useActions } from '../robot/actionsStore';
import { useRoomEdit } from '../robot/roomEditStore';
import {
  closeRoomEditor,
  deleteRoom,
  findRoomsOnMap,
  nameRoomsByLooking,
  renameRoom,
  roomAreaText,
  roomEditLine,
  roomNameProblem,
  sameRooms,
  saveRooms,
  startRenaming,
  stopRenaming,
} from '../robot/rooms';
import { isFresh, useRobot } from '../robot/store';
import { ActionBar, type BarButton } from './ActionBar';
import { NameDialog } from './NameDialog';
import { useNow } from './parts';
import { colors, spacing } from './theme';

const LIST_SHARE = 0.16; // of the window's height, at most: the map stays in sight on a short phone
const LIST_MAX = 150;

function ToolButton({ label, enabled, onPress }: { label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tool, !enabled && styles.toolOff, pressed && enabled && styles.pressed]}
    >
      <Text style={[styles.toolText, !enabled && styles.toolTextOff]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
    </Pressable>
  );
}

function RoomPanel() {
  const r = useRoomEdit();
  const now = useNow(500);
  const connected = useRobot((s) => s.connection.kind === 'connected');
  const status = useRobot((s) => s.assistant);
  const { height } = useWindowDimensions();
  const busy = r.work !== null;
  const line = roomEditLine(r, connected && isFresh(status, now) ? status!.value : null);

  function confirmNaming() {
    Alert.alert(
      'Name the rooms by looking?',
      'The robot drives to each room, looks around and names it. This takes a few minutes. Stop ends it at any time. Nothing is saved until you press Save.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: () => void nameRoomsByLooking() },
      ],
    );
  }

  function confirmDelete(index: number) {
    const name = r.draft[index]?.name ?? '';
    Alert.alert(`Delete '${name}'?`, 'The room is taken off the list. Save to make the change on the robot.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRoom(index) },
    ]);
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          Rooms · {r.mapName}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close without saving" onPress={closeRoomEditor} hitSlop={10} disabled={busy}>
          <Text style={[styles.close, busy && styles.off]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.tools}>
        <ToolButton label={r.work === 'finding' ? 'Finding…' : 'Find rooms'} enabled={!busy && connected} onPress={() => void findRoomsOnMap()} />
        <ToolButton label={r.work === 'naming' ? 'Naming…' : 'Name by looking'} enabled={!busy && connected && r.draft.length > 0} onPress={confirmNaming} />
      </View>
      <Text style={styles.line}>{line}</Text>
      {r.draft.length > 0 ? (
        <ScrollView style={{ maxHeight: Math.min(LIST_MAX, Math.round(height * LIST_SHARE)) }} nestedScrollEnabled>
          {r.draft.map((room, i) => (
            <View key={i} style={styles.room}>
              <Pressable
                style={styles.roomWords}
                onPress={() => startRenaming(i)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Rename ${room.name}`}
              >
                <Text style={styles.roomName} numberOfLines={1}>
                  {room.name}
                </Text>
                <Text style={styles.roomArea}>{roomAreaText(room.area)}</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(i)} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete the room ${room.name}`}>
                <Text style={[styles.delete, busy && styles.off]}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

export function RoomEditorBar({ stop }: { stop: { enabled: boolean; label: string; onPress: () => void } }) {
  const r = useRoomEdit();
  const notice = useActions((s) => s.notice);
  const robotRooms = useRobot((s) => s.rooms);
  const theirs = robotRooms && robotRooms.value.mapName === r.mapName ? robotRooms.value.rooms : [];
  const edited = !sameRooms(r.draft, theirs);
  const busy = r.work !== null;
  const index = r.renaming;
  const renaming = index !== null ? (r.draft[index] ?? null) : null;

  const buttons: BarButton[] = [
    { key: 'cancel', label: 'Cancel', enabled: !busy, hint: null, onPress: closeRoomEditor },
    { key: 'save', label: r.work === 'saving' ? 'Saving…' : 'Save', enabled: edited && !busy, hint: null, onPress: () => void saveRooms(), primary: true },
  ];
  return (
    <>
      <NameDialog
        visible={renaming !== null}
        title="Rename the room"
        suggestion={renaming?.name ?? ''}
        help="Ask the robot by this name: Clean the kitchen."
        backLabel="Cancel"
        what="room"
        autoCapitalize="sentences"
        saveLabel="Rename"
        problemOf={(name) => roomNameProblem(name, r.draft, index ?? -1)}
        save={async (name) => (index !== null && renameRoom(index, name) === null ? 'saved' : 'failed')}
        onClose={stopRenaming}
      />
      <ActionBar buttons={buttons} stop={stop} notice={notice} onDismiss={dismissNotice} banner={<RoomPanel />} />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: spacing.s },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  close: { fontSize: 18, color: colors.muted, paddingHorizontal: spacing.xs },
  off: { opacity: 0.4 },
  tools: { flexDirection: 'row', gap: spacing.s },
  tool: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  toolOff: { borderColor: colors.border },
  toolText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  toolTextOff: { color: colors.muted },
  pressed: { opacity: 0.7 },
  line: { fontSize: 14, color: colors.muted, marginTop: spacing.s, marginBottom: spacing.xs },
  room: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: spacing.s,
    gap: spacing.m,
  },
  roomWords: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: spacing.s },
  roomName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  roomArea: { fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  delete: { fontSize: 14, fontWeight: '600', color: colors.danger },
});
