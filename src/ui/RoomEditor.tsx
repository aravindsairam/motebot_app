// Changing the rooms, at the bottom of the Home tab while the map shows them for editing: Find
// rooms and Name by looking, what is going on, the rooms with their areas (tap one to rename it or,
// from the same dialog, to delete it), Cancel and Save. Nothing changes on the robot until Save;
// when the robot says no, the message card says why. Stop stays below, as on every screen.
//
// The two tools are outlined buttons side by side; the rooms are tiles two to a row, the name on
// the left and the area on the right.

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
import { Icon, type IconName } from './icons';
import { NameDialog } from './NameDialog';
import { useNow } from './parts';
import { colors, fonts, radius, spacing } from './theme';

const TILE_HEIGHT = 44; // a room's tile
const LIST_SHARE = 0.17; // of the window's height, at most: the map stays in sight on a short phone
const LIST_MAX = 3 * TILE_HEIGHT + 2 * spacing.s; // three whole rows of tiles; more rooms scroll
const TILE = '#f7f9f8'; // a room's tile: a shade lighter than the ground
const OFF_EDGE = '#d4dbd9'; // the dashed edge of a tool that cannot be used now, as in the bar

/** Asks before taking a room off the list; Delete also closes the rename dialog. */
function confirmDelete(index: number) {
  const name = useRoomEdit.getState().draft[index]?.name ?? '';
  Alert.alert(`Delete '${name}'?`, 'The room is taken off the list. Save to make the change on the robot.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteRoom(index) },
  ]);
}

function ToolButton({ label, icon, enabled, onPress }: { label: string; icon: IconName; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tool, !enabled && styles.toolOff, pressed && enabled && styles.pressed]}
    >
      <Icon name={icon} size={18} color={enabled ? colors.text : colors.faint} />
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

  // Two tiles to a row; an odd last room keeps half the width.
  const rows: number[][] = [];
  for (let i = 0; i < r.draft.length; i += 2) rows.push(i + 1 < r.draft.length ? [i, i + 1] : [i]);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          Rooms<Text style={styles.titleMap}>{` · ${r.mapName}`}</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close without saving"
          onPress={closeRoomEditor}
          disabled={busy}
          style={[styles.close, busy && styles.off]}
        >
          <Icon name="close" size={18} color={colors.muted} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={styles.pair}>
        <ToolButton label={r.work === 'finding' ? 'Finding…' : 'Find rooms'} icon="rooms" enabled={!busy && connected} onPress={() => void findRoomsOnMap()} />
        <ToolButton
          label={r.work === 'naming' ? 'Naming…' : 'Name by looking'}
          icon="camera"
          enabled={!busy && connected && r.draft.length > 0}
          onPress={confirmNaming}
        />
      </View>
      <Text style={styles.line}>{line}</Text>
      {r.draft.length > 0 ? (
        <ScrollView style={{ maxHeight: Math.min(LIST_MAX, Math.round(height * LIST_SHARE)) }} contentContainerStyle={styles.grid} nestedScrollEnabled>
          {rows.map((row) => (
            <View key={row[0]} style={styles.pair}>
              {row.map((i) => {
                const room = r.draft[i];
                return (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [styles.room, busy && styles.off, pressed && !busy && styles.pressed]}
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
                );
              })}
              {row.length === 1 ? <View style={styles.gap} /> : null}
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
        onDelete={index !== null ? () => confirmDelete(index) : undefined}
      />
      <ActionBar buttons={buttons} stop={stop} notice={notice} onDismiss={dismissNotice} banner={<RoomPanel />} />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 19, color: colors.text },
  titleMap: { fontFamily: fonts.displayMedium, color: colors.muted },
  close: { width: 44, height: 44, marginVertical: -8, marginRight: -10, justifyContent: 'center', alignItems: 'center' },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  pair: { flexDirection: 'row', gap: spacing.s },
  gap: { flex: 1 },
  tool: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    gap: spacing.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderStyle: 'solid', // named, so Android drops the dashed edge when the button becomes usable
    borderColor: colors.field,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.s,
  },
  toolOff: { borderStyle: 'dashed', borderColor: OFF_EDGE },
  toolText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  toolTextOff: { color: colors.faint },
  line: { fontSize: 14, color: colors.muted },
  grid: { gap: spacing.s },
  room: {
    flex: 1,
    height: TILE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: TILE,
    paddingHorizontal: spacing.m,
  },
  roomName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  roomArea: { fontSize: 12, fontWeight: '500', color: colors.muted, fontVariant: ['tabular-nums'] },
});
