// One past clean, opened from the History tab, as a sheet up from the bottom: what was cleaned and
// how it ended, when and with which options, the robot's picture of it (the map, the floor it
// cleaned tinted, the path it drove) and its numbers. Also the small label for how a clean ended,
// which the History list uses too.

import { Canvas, Image, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recordView, targetLabel, whenText } from '../robot/cleaningText';
import { closeRecord } from '../robot/history';
import { useHistory } from '../robot/historyStore';
import { Icon } from './icons';
import { Button } from './parts';
import { colors, fonts, radius, sheetShadow, spacing } from './theme';

const MAX_PICTURE_HEIGHT = 300;
const LIGHT_EDGE = '#e3e8e6'; // the edge of a card or a box on white
const HANDLE = '#d3dad7'; // the grab handle at the top of the sheet
// The colours the robot paints its picture of a clean with (picture.py in vacuum_coverage).
const PICTURE_CLEANED = '#96cdf0';
const PICTURE_PATH = '#143c8c';

const ENDED_LOOK: Record<string, { label: string; color: string; background: string }> = {
  done: { label: 'Done', color: colors.goodText, background: colors.goodBackground },
  stopped: { label: 'Stopped', color: colors.warning, background: colors.warningBackground },
  failed: { label: "Didn't finish", color: colors.dangerText, background: colors.dangerBackground },
};

/** The word and colours for how a clean ended, as endedLabel gives it ("done", "stopped", "failed"). */
export function endedLook(ended: string): { label: string; color: string; background: string } {
  return ENDED_LOOK[ended] ?? { label: ended.charAt(0).toUpperCase() + ended.slice(1), color: colors.muted, background: colors.line };
}

/** How a clean ended, as a small coloured label: Done, Stopped, Didn't finish. */
export function EndedChip({ ended }: { ended: string }) {
  const look = endedLook(ended);
  return (
    <View style={[styles.chip, { backgroundColor: look.background }]}>
      <Text style={[styles.chipText, { color: look.color }]} numberOfLines={1}>
        {look.label}
      </Text>
    </View>
  );
}

/** The robot's PNG, drawn with Skia from the bytes it sent, in a rounded box, with what its colours mean. */
function Picture({ png }: { png: Uint8Array }) {
  const [width, setWidth] = useState(0);
  const image = useMemo(() => (png.length > 0 ? Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(png)) : null), [png]);
  if (!image) return <Text style={styles.note}>The robot's picture could not be read.</Text>;
  const height = width > 0 ? Math.min(MAX_PICTURE_HEIGHT, (width * image.height()) / image.width()) : 0;
  return (
    <View style={styles.figure}>
      {/* The box has a 1 px edge on each side: the picture fills what is inside it. */}
      <View style={styles.picture} onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(0, e.nativeEvent.layout.width - 2))}>
        {width > 0 ? (
          <Canvas style={{ width, height }}>
            <Image image={image} x={0} y={0} width={width} height={height} fit="contain" />
          </Canvas>
        ) : null}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.swatchCleaned} />
          <Text style={styles.legendText}>Floor cleaned</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.swatchPath} />
          <Text style={styles.legendText}>Path driven</Text>
        </View>
      </View>
    </View>
  );
}

/** The numbers, two to a row, each in a light box: its name, the value large, the rest under it. */
function Numbers({ numbers }: { numbers: { label: string; value: string; more: string }[] }) {
  const rows: (typeof numbers)[] = [];
  for (let i = 0; i < numbers.length; i += 2) rows.push(numbers.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={row[0].label} style={styles.gridRow}>
          {row.map((n, c) => (
            <View key={n.label} style={styles.box}>
              <Text style={styles.boxLabel}>{n.label}</Text>
              <Text
                style={[styles.boxValue, r === 0 && c === 0 && styles.boxValueFirst]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {n.value}
              </Text>
              {n.more ? <Text style={styles.boxMore}>{n.more}</Text> : null}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.boxSpace} /> : null}
        </View>
      ))}
    </View>
  );
}

export function RecordDialog() {
  const open = useHistory((s) => s.open);
  const insets = useSafeAreaInsets();
  const record = open?.record ?? null;
  const view = record ? recordView(record.status) : null;
  return (
    <Modal visible={open !== null} transparent animationType="fade" onRequestClose={closeRecord}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.handle} accessible={false} importantForAccessibility="no" />
          <View style={styles.head}>
            <View style={styles.headWords}>
              {record && view ? (
                <>
                  <View style={styles.titleLine}>
                    <Text style={styles.title} accessibilityRole="header">
                      {targetLabel(record.status.target)}
                    </Text>
                    <EndedChip ended={view.ended} />
                  </View>
                  <Text style={styles.subtitle}>
                    {whenText(record.started, Date.now())} · {view.options}
                  </Text>
                  {view.reason ? <Text style={[styles.reason, { color: endedLook(view.ended).color }]}>{view.reason}</Text> : null}
                </>
              ) : open?.state === 'failed' ? (
                <Text style={styles.bad}>Couldn't load this clean: {open.problem}</Text>
              ) : (
                <Text style={styles.note}>Loading…</Text>
              )}
            </View>
            <Pressable
              onPress={closeRecord}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.x, pressed && styles.pressed]}
            >
              <Icon name="close" size={18} strokeWidth={2.2} color={colors.muted} />
            </Pressable>
          </View>

          {record && view ? (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              {open?.state === 'ready' && record.picture.length > 0 ? <Picture png={record.picture} /> : null}
              {open?.state === 'loading' ? <Text style={styles.note}>Loading the picture…</Text> : null}
              {open?.state === 'failed' ? <Text style={styles.bad}>No picture: {open.problem}</Text> : null}
              <Numbers numbers={view.numbers} />
            </ScrollView>
          ) : null}

          <Button kind="plain" label="Close" onPress={closeRecord} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: spacing.l,
    gap: 14,
    ...sheetShadow,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: HANDLE },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headWords: { flex: 1, gap: spacing.xs },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { flexShrink: 1, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.4, color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
  reason: { fontSize: 14 },
  x: { width: 44, height: 44, marginTop: -6, marginRight: -10, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  pressed: { opacity: 0.7 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { gap: 14 },
  figure: { gap: spacing.s },
  picture: { width: '100%', borderRadius: radius.xl, borderWidth: 1, borderColor: LIGHT_EDGE, overflow: 'hidden', backgroundColor: colors.soft },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.l, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchCleaned: { width: 14, height: 10, borderRadius: 2, backgroundColor: PICTURE_CLEANED },
  swatchPath: { width: 16, height: 2, backgroundColor: PICTURE_PATH },
  legendText: { fontSize: 12, color: colors.muted },
  grid: { gap: spacing.s },
  gridRow: { flexDirection: 'row', gap: spacing.s },
  box: { flex: 1, paddingVertical: spacing.m, paddingHorizontal: 14, borderRadius: radius.l, backgroundColor: colors.soft, gap: 2 },
  boxSpace: { flex: 1 },
  boxLabel: { fontSize: 12, color: colors.muted },
  boxValue: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  boxValueFirst: { color: colors.primary },
  boxMore: { fontSize: 13, color: colors.muted },
  note: { fontSize: 14, color: colors.muted },
  bad: { fontSize: 14, color: colors.danger },
});
