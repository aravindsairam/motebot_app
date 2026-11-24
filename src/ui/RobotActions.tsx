// The buttons as the screens use them: which are usable (from the robot's own state), the
// confirmations, and the bar at the bottom of every tab.

import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { runAction } from '../robot/actions';
import { dismissNotice, showNotice, useActions } from '../robot/actionsStore';
import { closeChooser, forgetCleanStart, openChooser, pauseClean } from '../robot/cleaning';
import { useChoice, useCleaning } from '../robot/cleaningStore';
import { cleaningControlsFor } from '../robot/cleaningView';
import { sendDrive } from '../robot/commands';
import { controlsFor } from '../robot/controls';
import { releaseStick } from '../robot/drive';
import { explore } from '../robot/exploring';
import { discardMap, startMapping } from '../robot/mapping';
import { modeLook } from '../robot/modes';
import { useRoomEdit } from '../robot/roomEditStore';
import { closeRoomEditor } from '../robot/rooms';
import { isFresh, useRobot } from '../robot/store';
import { startPicking, stopPicking } from '../robot/trip';
import { forgetGoal, useTrip } from '../robot/tripStore';
import { closeZoneEditor, useZoneEdit } from '../robot/zones';
import { ActionBar, type BarButton } from './ActionBar';
import { CleanChooserBar } from './CleanChooser';
import { Button, useNow } from './parts';
import { RoomEditorBar } from './RoomEditor';
import { SaveMapDialog } from './SaveMapDialog';
import { ZoneEditorBar } from './ZoneEditor';
import { colors, spacing } from './theme';

/** Leaving mapping loses the map being made: ask before doing it. */
export function confirmLeavingMapping(title: string, what: string, confirm: string, go: () => void) {
  Alert.alert(title, `${what} The map being made has not been saved and will be lost.`, [
    { text: 'Keep mapping', style: 'cancel' },
    { text: confirm, style: 'destructive', onPress: go },
  ]);
}

export function useRobotActions() {
  const now = useNow();
  const connected = useRobot((s) => s.connection.kind === 'connected');
  const robotState = useRobot((s) => s.robotState);
  const { busy, notice } = useActions();
  const cleaningStatus = useCleaning((s) => s.status);
  const live = connected && isFresh(robotState, now);
  const controls = controlsFor(robotState?.value ?? null, live, connected);
  const cleaning = cleaningControlsFor(robotState?.value ?? null, live, connected, cleaningStatus?.value ?? null, connected && isFresh(cleaningStatus, now));

  function stop() {
    if (controls.stop.halts) {
      // In mapping: stop moving, keep mapping. Leaving would lose the map being made.
      releaseStick();
      void sendDrive(0, 0);
      showNotice({ tone: 'info', title: 'Stopped. Still mapping', text: 'Save the map or discard it to finish.' });
      return;
    }
    forgetGoal(); // the user ended the trip: how it ends is no news
    forgetCleanStart(); // a clean asked for and not yet answered: the report card says how it ended
    runAction('stop', 'idle', "Couldn't stop");
  }

  function dock() {
    const go = () => {
      forgetGoal();
      forgetCleanStart();
      runAction('dock', 'docking', "Couldn't dock");
    };
    if (controls.dock.asksFirst) {
      confirmLeavingMapping('Dock now?', 'This leaves mapping and sends the robot to its dock.', 'Dock and lose the map', go);
    } else {
      go();
    }
  }

  function drive() {
    forgetGoal();
    runAction('drive', 'manual', "Couldn't start driving");
  }

  function newMap() {
    const current = useRobot.getState().robotState?.value.currentMap ?? '';
    const go = () => {
      forgetGoal();
      void startMapping();
    };
    Alert.alert(
      'Make a new map?',
      `Drive the robot around every room with the joystick; the map grows as it goes. ${
        current ? `The robot keeps using '${current}' until you save the new map.` : 'Save it when the rooms are covered.'
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start mapping', onPress: go },
      ],
    );
  }

  function discard() {
    Alert.alert('Discard the new map?', 'The map made so far is thrown away, and the robot stops mapping.', [
      { text: 'Keep mapping', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discardMap() },
    ]);
  }

  /** Back to idle, or to mapping when the robot offers it: then the map being made is kept. */
  function reset() {
    runAction('reset', controls.reset.target, "Couldn't reset");
  }

  /** In mapping: let the robot finish the map by itself. */
  function startExploring() {
    forgetGoal();
    void explore();
  }

  /** Clean: the choosing panel. Nothing moves until Start. */
  function clean() {
    stopPicking();
    openChooser();
  }

  function pauseOrResume() {
    void pauseClean(cleaning.pause.resume);
  }

  /** Any mode the robot allows, from the Robot tab. */
  function switchTo(mode: string) {
    const go = () => {
      forgetGoal();
      runAction('mode', mode, `Couldn't switch to ${modeLook(mode).label.toLowerCase()}`);
    };
    if (controls.makingMap && mode !== 'mapping') {
      confirmLeavingMapping('Leave mapping?', `This switches the robot to ${modeLook(mode).label.toLowerCase()}.`, 'Switch and lose the map', go);
    } else {
      go();
    }
  }

  // Stop as every screen shows it: usable unless the robot is known to be at rest.
  const stopButton = { enabled: controls.stop.enabled && busy !== 'stop', label: busy === 'stop' ? 'STOPPING…' : 'STOP', onPress: stop };

  return { controls, cleaning, busy, notice, live, connected, stop, stopButton, dock, drive, newMap, discard, reset, switchTo, clean, pauseOrResume, startExploring };
}

/** On the main screen: the robot is in failsafe, and how to get out of it. */
function FailsafeCard() {
  const reason = useRobot((s) => s.robotState?.value.reason ?? '');
  const { controls, busy, reset } = useRobotActions();
  return (
    <View style={styles.failsafe} accessibilityRole="alert">
      <View style={styles.failsafeHead}>
        <View style={styles.failsafeIcon}>
          <Text style={styles.failsafeIconText}>!</Text>
        </View>
        <Text style={styles.failsafeTitle}>Failsafe: the robot is stopped</Text>
      </View>
      {reason ? <Text style={styles.failsafeText}>{reason}</Text> : null}
      {controls.reset.target === 'mapping' ? <Text style={styles.failsafeText}>Reset goes back to mapping: the map being made is kept.</Text> : null}
      <View style={styles.failsafeButton}>
        <Button label={busy === 'reset' ? 'Resetting…' : 'Reset'} onPress={reset} disabled={!controls.reset.enabled || busy !== null} />
        {controls.reset.hint ? <Text style={styles.failsafeHint}>{controls.reset.hint}</Text> : null}
      </View>
    </View>
  );
}

/** The bar at the bottom of a tab. The main screen's has Go to, Drive, New map and Dock, with
 *  Clean beside Stop; while mapping, Save map and Discard; while choosing a clean, the choosing
 *  panel; while changing the no-go zones or the rooms, their editor; while cleaning, Pause (or
 *  Resume) and Dock. The other tabs' have only Dock. Stop ends whatever the robot is doing, a
 *  trip or a clean included; in mapping it only stops the motion. */
export function RobotActionBar({ main = false }: { main?: boolean }) {
  const { controls, cleaning, busy, notice, live, connected, stopButton, dock, drive, newMap, discard, clean, pauseOrResume, startExploring } = useRobotActions();
  const picking = useTrip((s) => s.picking);
  const choosing = useChoice((s) => s.open);
  const editingZones = useZoneEdit((s) => s.open);
  const zonesMap = useZoneEdit((s) => s.mapName);
  const editingRooms = useRoomEdit((s) => s.open);
  const roomsMap = useRoomEdit((s) => s.mapName);
  const mode = useRobot((s) => s.robotState?.value.state ?? '');
  const currentMap = useRobot((s) => s.robotState?.value.currentMap ?? '');
  const [saving, setSaving] = useState(false);

  // The robot went into mapping or failsafe while a clean was being chosen: their own buttons
  // (Save map, Reset) take the bar back.
  const leaveChoosing = main && choosing && live && (controls.makingMap || mode === 'failsafe');
  useEffect(() => {
    if (leaveChoosing) closeChooser();
  }, [leaveChoosing]);
  // The zones being changed belong to a map; if the robot leaves it (or starts mapping, cleaning,
  // failsafe), the edit is over: Save would be refused anyway.
  const leaveZones = main && editingZones && live && (controls.makingMap || ['cleaning', 'failsafe'].includes(mode) || currentMap !== zonesMap);
  useEffect(() => {
    if (leaveZones) closeZoneEditor();
  }, [leaveZones]);
  // The same for the rooms: they belong to the map in use.
  const leaveRooms = main && editingRooms && live && (controls.makingMap || ['cleaning', 'failsafe'].includes(mode) || currentMap !== roomsMap);
  useEffect(() => {
    if (leaveRooms) closeRoomEditor();
  }, [leaveRooms]);

  const cleaningNow = main && (cleaning.running || busy === 'clean');
  if (main && editingZones && !leaveZones) {
    return <ZoneEditorBar stop={stopButton} />;
  }
  if (main && editingRooms && !leaveRooms) {
    return <RoomEditorBar stop={stopButton} />;
  }
  if (main && choosing && !cleaningNow && !leaveChoosing) {
    return <CleanChooserBar cleanable={cleaning.clean} connected={connected} stop={stopButton} />;
  }

  const dockButton: BarButton = {
    key: 'dock',
    icon: 'dock',
    label: busy === 'dock' ? 'Starting…' : controls.dock.label,
    enabled: controls.dock.enabled && busy === null,
    hint: controls.dock.hint,
    onPress: dock,
  };
  const mappingButtons: BarButton[] = [
    {
      key: 'explore',
      icon: 'explore',
      color: colors.explore,
      label: busy === 'explore' ? 'Starting…' : 'Explore',
      enabled: controls.explore.enabled && busy === null,
      hint: controls.explore.hint,
      onPress: startExploring,
      primary: true,
    },
    {
      key: 'save',
      label: busy === 'save_map' ? 'Saving…' : 'Save map',
      enabled: busy === null && live,
      hint: null,
      onPress: () => setSaving(true),
    },
    {
      key: 'discard',
      label: busy === 'discard_map' ? 'Discarding…' : 'Discard',
      enabled: busy === null && live,
      hint: null,
      onPress: discard,
      danger: true,
    },
  ];
  const cleaningButtons: BarButton[] = [
    {
      key: 'pause',
      icon: cleaning.pause.resume ? 'resume' : 'pause',
      label: busy === 'pause' ? 'Pausing…' : busy === 'resume' ? 'Resuming…' : cleaning.pause.label,
      enabled: cleaning.pause.enabled && busy === null,
      hint: null,
      onPress: pauseOrResume,
      primary: cleaning.pause.resume,
    },
    dockButton,
  ];
  const mainButtons: BarButton[] = [
    {
      key: 'goto',
      icon: 'goTo',
      label: busy === 'goto' ? 'Starting…' : picking ? 'Tap the map' : 'Go to',
      enabled: controls.goTo.enabled && busy === null && !picking,
      hint: picking ? null : controls.goTo.hint,
      onPress: startPicking,
      active: picking,
      color: colors.info,
    },
    {
      key: 'drive',
      icon: 'drive',
      label: busy === 'drive' ? 'Starting…' : controls.drive.label,
      enabled: controls.drive.enabled && busy === null,
      hint: controls.drive.hint,
      onPress: drive,
      active: mode === 'manual',
    },
    {
      key: 'newmap',
      icon: 'newMap',
      label: busy === 'new_map' ? 'Starting…' : 'New map',
      enabled: controls.newMap.enabled && busy === null,
      hint: controls.newMap.hint,
      onPress: newMap,
    },
    dockButton,
  ];
  const cleanButton: BarButton = {
    key: 'clean',
    icon: 'clean',
    label: 'Clean',
    enabled: cleaning.clean.enabled && busy === null,
    hint: cleaning.clean.hint,
    onPress: clean,
    color: colors.cleaning,
  };
  // While exploring the robot drives itself: only Stop, which ends the exploration and keeps the map.
  const buttons: BarButton[] = !main
    ? [dockButton]
    : controls.exploring
      ? []
      : controls.mapping
        ? mappingButtons
        : cleaningNow
          ? cleaningButtons
          : mainButtons;
  const lead = main && !controls.mapping && !controls.exploring && !cleaningNow ? cleanButton : undefined;
  const tiles = buttons === mainButtons; // the Home tab at rest: icon tiles, then Clean and Stop
  return (
    <>
    <SaveMapDialog visible={saving} suggestion={currentMap || 'house'} onClose={() => setSaving(false)} />
    <ActionBar
      buttons={buttons}
      lead={lead}
      stop={stopButton}
      notice={notice}
      onDismiss={dismissNotice}
      banner={main && live && mode === 'failsafe' ? <FailsafeCard /> : null}
      tiles={tiles}
    />
    </>
  );
}

const styles = StyleSheet.create({
  failsafe: { backgroundColor: colors.dangerBackground, borderRadius: 16, padding: 14 },
  failsafeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  failsafeIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center' },
  failsafeIconText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  failsafeTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.dangerText },
  failsafeText: { fontSize: 14, lineHeight: 20, color: colors.text, marginTop: spacing.s },
  failsafeButton: { marginTop: spacing.m },
  failsafeHint: { fontSize: 13, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
});
