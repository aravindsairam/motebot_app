// The robot's camera, live. Connected only while it is on screen (large, or in the corner
// window, with the Home tab open), so the PC encodes video only while someone looks at it. If the video fails it says
// why and tries again every few seconds. Large, a white "Camera" pill names it at the top left;
// in the corner window, a small dark one at the bottom left.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';

import { useRobot } from '../robot/store';
import { type VideoState, watchCamera } from '../robot/video';
import { colors, floatShadow, radius, spacing } from './theme';

const RETRY_MS = 3000;
const LIGHT_TEXT = 'rgba(255,255,255,0.7)'; // the note under "Camera" on the dark ground

export function CameraView({ small, active }: { small: boolean; active: boolean }) {
  const address = useRobot((s) => s.address);
  const connected = useRobot((s) => s.connection.kind === 'connected');
  const [state, setState] = useState<VideoState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active || !connected || !address) {
      setState(null);
      return;
    }
    let retry: ReturnType<typeof setTimeout> | null = null;
    const link = watchCamera(address, (s) => {
      setState(s);
      if (s.kind === 'failed') retry = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
    });
    return () => {
      if (retry !== null) clearTimeout(retry);
      link.close();
    };
  }, [active, connected, address, attempt]);

  if (state?.kind === 'playing') {
    return (
      <View style={styles.box}>
        <RTCView streamURL={state.streamUrl} objectFit={small ? 'cover' : 'contain'} style={StyleSheet.absoluteFill} zOrder={0} />
        {small ? (
          <View style={styles.tag} pointerEvents="none">
            <Text style={styles.tagText}>Camera</Text>
          </View>
        ) : (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>Camera</Text>
          </View>
        )}
      </View>
    );
  }

  let note = '';
  if (!connected) note = 'Not connected';
  else if (state?.kind === 'connecting') note = 'Connecting to the camera…';
  else if (state?.kind === 'failed') note = small ? 'No video' : `No video: ${state.why}. Trying again…`;
  return (
    <View style={[styles.box, styles.centre]}>
      <Text style={[styles.title, small && styles.titleSmall]}>Camera</Text>
      {note ? <Text style={[styles.note, small && styles.noteSmall]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: colors.text },
  centre: { justifyContent: 'center', alignItems: 'center', padding: spacing.m },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  titleSmall: { fontSize: 13 },
  note: { color: LIGHT_TEXT, fontSize: 14, marginTop: spacing.s, textAlign: 'center' },
  noteSmall: { fontSize: 11, marginTop: 2 },
  badge: {
    position: 'absolute',
    top: spacing.m,
    left: spacing.m,
    backgroundColor: colors.float,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
    ...floatShadow,
  },
  badgeText: { fontSize: 13, fontWeight: '500', color: colors.text },
  tag: {
    position: 'absolute',
    left: spacing.s,
    bottom: 7,
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagText: { fontSize: 11, fontWeight: '600', color: '#ffffff' },
});
