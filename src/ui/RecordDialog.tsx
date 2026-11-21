// One past clean, opened from the History tab: the robot's picture of it (the map, the floor it
// cleaned tinted, the path it drove) and its numbers.

import { Canvas, Image, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { recordRows, targetLabel, whenText } from '../robot/cleaningText';
import { closeRecord } from '../robot/history';
import { useHistory } from '../robot/historyStore';
import { Row } from './parts';
import { colors, spacing } from './theme';

const MAX_PICTURE_HEIGHT = 340;

/** The robot's PNG, drawn with Skia from the bytes it sent. */
function Picture({ png }: { png: Uint8Array }) {
  const [width, setWidth] = useState(0);
  const image = useMemo(() => (png.length > 0 ? Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(png)) : null), [png]);
  if (!image) return <Text style={styles.note}>The robot's picture could not be read.</Text>;
  const height = width > 0 ? Math.min(MAX_PICTURE_HEIGHT, (width * image.height()) / image.width()) : 0;
  return (
    <View style={styles.picture} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Canvas style={{ width, height }}>
          <Image image={image} x={0} y={0} width={width} height={height} fit="contain" />
        </Canvas>
      ) : null}
    </View>
  );
}

export function RecordDialog() {
  const open = useHistory((s) => s.open);
  const record = open?.record ?? null;
  return (
    <Modal visible={open !== null} transparent animationType="fade" onRequestClose={closeRecord}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <ScrollView>
            {record ? (
              <>
                <Text style={styles.title}>
                  {whenText(record.started, Date.now())} · {targetLabel(record.status.target)}
                </Text>
                {open?.state === 'ready' && record.picture.length > 0 ? <Picture png={record.picture} /> : null}
                {open?.state === 'loading' ? <Text style={styles.note}>Loading the picture…</Text> : null}
                {open?.state === 'failed' ? <Text style={styles.bad}>No picture: {open.problem}</Text> : null}
                {recordRows(record.status).map((r) => (
                  <Row key={r.label} label={r.label} value={r.value} />
                ))}
              </>
            ) : open?.state === 'failed' ? (
              <Text style={styles.bad}>Couldn't load this clean: {open.problem}</Text>
            ) : (
              <Text style={styles.note}>Loading…</Text>
            )}
          </ScrollView>
          <Pressable onPress={closeRecord} style={styles.close} accessibilityRole="button">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.l },
  dialog: { backgroundColor: colors.card, borderRadius: 14, padding: spacing.l, maxHeight: '90%' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.m },
  picture: { width: '100%', marginBottom: spacing.m, alignItems: 'center' },
  note: { fontSize: 14, color: colors.muted, marginBottom: spacing.m },
  bad: { fontSize: 14, color: colors.danger, marginBottom: spacing.m },
  close: { marginTop: spacing.m, height: 46, borderRadius: 10, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});
