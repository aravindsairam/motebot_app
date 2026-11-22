// The Ask tab: a chat with the robot. Type a question or tap a suggestion; the robot answers in
// its own words, sometimes with what its camera saw (tap the picture to see it larger) or a place
// on the map ("Show on map" switches to the Home tab and marks it there). To answer, the robot may
// drive somewhere: meanwhile three dots, and under them what it is doing. One question at a time.
// New chat starts afresh. While the robot moves, Stop is in the header, as on every tab.
//
// The chat is kept while the app runs (chatStore.ts), not after it is closed. The suggestions are
// enough to use the tab without a keyboard.

import { type NavigationProp, useNavigation } from '@react-navigation/native';
import { memo, useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { dismissNotice } from '../robot/actionsStore';
import { askRobot, startNewChat } from '../robot/ask';
import { type ChatBubble, doingLine, MAX_QUESTION_LENGTH } from '../robot/chat';
import { chipsFor } from '../robot/chatChips';
import { useChat } from '../robot/chatStore';
import { showMark } from '../robot/markStore';
import { isFresh, useRobot } from '../robot/store';
import { NoticeCard } from '../ui/NoticeCard';
import { useNow } from '../ui/parts';
import { useRobotActions } from '../ui/RobotActions';
import { RobotPicture } from '../ui/RobotPicture';
import { swapViews, useStage } from '../ui/stageStore';
import { colors, spacing } from '../ui/theme';

const LINE_HEIGHT = 20; // of the text field; it grows to three lines, then scrolls
const INPUT_PADDING = 9;
const THUMBNAIL_MAX_WIDTH = 220;
const THUMBNAIL_MAX_HEIGHT = 170;

/** Three dots, one lit after the other: the robot is working on the answer. */
function Dots() {
  const now = useNow(350);
  const lit = Math.floor(now / 350) % 3;
  return (
    <View style={styles.dots} accessibilityLabel="The robot is thinking">
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.dot, i === lit && styles.dotLit]} />
      ))}
    </View>
  );
}

// Kept as it is while the screen redraws for the clock: a picture is not drawn again each time.
const Bubble = memo(function Bubble({
  bubble,
  thumbnailWidth,
  onPicture,
  onShowOnMap,
}: {
  bubble: ChatBubble;
  thumbnailWidth: number;
  onPicture: (jpeg: Uint8Array) => void;
  onShowOnMap: (mark: { x: number; y: number }) => void;
}) {
  if (bubble.from === 'me') {
    return (
      <View style={[styles.bubble, styles.mine]} accessible accessibilityLabel={`You: ${bubble.text}`}>
        <Text style={styles.mineText}>{bubble.text}</Text>
      </View>
    );
  }
  const { picture, mark } = bubble;
  return (
    <View style={[styles.bubble, styles.theirs, bubble.problem && styles.problem]}>
      {bubble.problem ? <Text style={styles.problemTitle}>No answer</Text> : null}
      {bubble.text ? <Text style={styles.theirsText}>{bubble.text}</Text> : null}
      {picture ? (
        <Pressable
          onPress={() => onPicture(picture)}
          accessibilityRole="imagebutton"
          accessibilityLabel="What the robot saw. Tap to see it larger"
          style={[styles.picture, bubble.text ? styles.pictureBelowText : null]}
        >
          <View pointerEvents="none">
            <RobotPicture bytes={picture} maxWidth={thumbnailWidth} maxHeight={THUMBNAIL_MAX_HEIGHT} />
          </View>
        </Pressable>
      ) : null}
      {mark ? (
        <Pressable onPress={() => onShowOnMap(mark)} hitSlop={8} accessibilityRole="link" style={styles.showOnMap}>
          <Text style={styles.link}>Show on map</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export function AskScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const now = useNow(500);
  const chat = useChat();
  const hello = useRobot((s) => s.hello);
  const status = useRobot((s) => s.assistant);
  const rooms = useRobot((s) => s.rooms);
  const currentMap = useRobot((s) => s.robotState?.value.currentMap ?? '');
  const mode = useRobot((s) => s.robotState?.value.state ?? '');
  const { controls, cleaning, busy, notice, live, connected, stopButton } = useRobotActions();
  const { width, height, fontScale } = useWindowDimensions();
  const [text, setText] = useState('');
  const [viewing, setViewing] = useState<Uint8Array | null>(null);
  const list = useRef<ScrollViewInstance>(null);

  const canAsk = connected && !chat.waiting;
  const canSend = canAsk && text.trim().length > 0;
  const doing = doingLine(chat, connected && isFresh(status, now) ? status!.value : null);
  const chips = chipsFor({
    connected,
    mode: live ? mode : '',
    cleaning: cleaning.running ? (cleaning.pause.resume ? 'paused' : 'running') : 'none',
    rooms: rooms && rooms.value.mapName === currentMap ? rooms.value.rooms.map((r) => r.name) : [],
  });
  // Stop shows while the robot moves (and while nobody knows whether it does), as on every tab.
  const showStop = controls.stop.enabled || busy === 'stop';
  const inputMaxHeight = Math.ceil(3 * LINE_HEIGHT * fontScale) + 2 * INPUT_PADDING + 2;
  const thumbnailWidth = Math.min(THUMBNAIL_MAX_WIDTH, Math.round(width * 0.6));

  function send() {
    if (!canSend) return;
    const question = text;
    setText('');
    void askRobot(question);
  }

  const showOnMap = useCallback(
    (mark: { x: number; y: number }) => {
      showMark(mark.x, mark.y);
      if (useStage.getState().big !== 'map') swapViews();
      navigation.navigate('Home');
    },
    [navigation],
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={[styles.status, { backgroundColor: live ? colors.good : connected ? colors.warning : colors.danger }]} />
          <Text style={styles.name} numberOfLines={1}>
            {hello?.robotName ?? 'Robot'}
          </Text>
          {showStop ? (
            <Pressable
              onPress={stopButton.onPress}
              disabled={!stopButton.enabled}
              accessibilityRole="button"
              accessibilityLabel="Stop the robot"
              style={({ pressed }) => [styles.stop, !stopButton.enabled && styles.stopOff, pressed && styles.pressed]}
            >
              <Text style={styles.stopText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {stopButton.label}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={startNewChat}
            disabled={chat.bubbles.length === 0 && !chat.waiting}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}
          >
            <Text style={[styles.newChatText, chat.bubbles.length === 0 && !chat.waiting && styles.off]} numberOfLines={1}>
              New chat
            </Text>
          </Pressable>
        </View>
        {!connected ? (
          <Text style={styles.offline}>Reconnecting… You can ask again once the robot is back.</Text>
        ) : !live ? (
          <Text style={styles.offline}>No news from the robot</Text>
        ) : null}

        <ScrollView
          ref={list}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        >
          {chat.bubbles.length === 0 && !chat.waiting ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ask the robot</Text>
              <Text style={styles.emptyText}>
                Ask in your own words, or tap a suggestion below. To answer, the robot may look with its camera or drive to a room.
              </Text>
            </View>
          ) : null}
          {chat.bubbles.map((b) => (
            <Bubble key={b.id} bubble={b} thumbnailWidth={thumbnailWidth} onPicture={setViewing} onShowOnMap={showOnMap} />
          ))}
          {chat.waiting ? (
            <View>
              <View style={[styles.bubble, styles.theirs]}>
                <Dots />
              </View>
              {doing ? <Text style={styles.doing}>{doing}</Text> : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.inputArea}>
          {/* The message card every tab has: a Stop that failed, the report at the end of a clean. */}
          {notice ? (
            <View style={styles.notice}>
              <NoticeCard notice={notice} onDismiss={dismissNotice} />
            </View>
          ) : null}
          {chips.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
              {chips.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => void askRobot(chip)}
                  disabled={!canAsk}
                  accessibilityRole="button"
                  accessibilityHint="Asks the robot at once"
                  style={({ pressed }) => [styles.chip, !canAsk && styles.chipOff, pressed && styles.pressed]}
                >
                  <Text style={[styles.chipText, !canAsk && styles.chipTextOff]} numberOfLines={1}>
                    {chip}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask the robot…"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={MAX_QUESTION_LENGTH}
              autoCapitalize="sentences"
              style={[styles.input, { maxHeight: inputMaxHeight }]}
              accessibilityLabel="Your question"
            />
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.send, !canSend && styles.sendOff, pressed && canSend && styles.pressed]}
            >
              <Text style={styles.sendText} numberOfLines={1}>
                Send
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityRole="button" accessibilityLabel="Close the picture">
          {viewing ? (
            <View pointerEvents="none">
              <RobotPicture bytes={viewing} maxWidth={width - 2 * spacing.l} maxHeight={Math.round(height * 0.75)} />
            </View>
          ) : null}
          <Text style={styles.viewerHint}>Tap to close</Text>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
    minHeight: 52,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  status: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
  stop: { minWidth: 72, maxWidth: 120, height: 36, borderRadius: 18, backgroundColor: colors.danger, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.m },
  stopOff: { backgroundColor: '#f3a5a5' },
  stopText: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 1 },
  newChat: { height: 36, justifyContent: 'center', paddingHorizontal: spacing.s },
  newChatText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  off: { color: colors.muted },
  pressed: { opacity: 0.75 },
  offline: { fontSize: 13, color: colors.warning, backgroundColor: colors.warningBackground, paddingHorizontal: spacing.l, paddingVertical: spacing.xs },
  notice: { paddingHorizontal: spacing.l },
  list: { flex: 1 },
  listContent: { padding: spacing.l, gap: spacing.s, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.l },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: spacing.m, paddingVertical: spacing.s },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  mineText: { fontSize: 15, color: '#ffffff' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  theirsText: { fontSize: 15, color: colors.text },
  problem: { backgroundColor: colors.warningBackground, borderColor: '#fcd34d' },
  problemTitle: { fontSize: 12, fontWeight: '700', color: colors.warning, marginBottom: 2 },
  picture: { borderRadius: 8, overflow: 'hidden', alignSelf: 'flex-start' },
  pictureBelowText: { marginTop: spacing.s },
  showOnMap: { marginTop: spacing.s, alignSelf: 'flex-start' },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
  dots: { flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotLit: { backgroundColor: colors.muted },
  doing: { fontSize: 13, color: colors.muted, fontStyle: 'italic', marginTop: spacing.xs, marginLeft: spacing.s },
  inputArea: { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.s, paddingBottom: spacing.s },
  chips: { gap: spacing.s, paddingHorizontal: spacing.l, paddingBottom: spacing.s },
  chip: { maxWidth: 260, borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: spacing.m, paddingVertical: 6 },
  chipOff: { borderColor: colors.border },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  chipTextOff: { color: colors.muted },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s, paddingHorizontal: spacing.l },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.m,
    paddingVertical: INPUT_PADDING,
    fontSize: 15,
    lineHeight: LINE_HEIGHT,
    color: colors.text,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  send: { height: 44, minWidth: 64, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.m },
  sendOff: { backgroundColor: colors.primaryDisabled },
  sendText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: spacing.l },
  viewerHint: { fontSize: 13, color: '#e5e7eb', marginTop: spacing.m },
});
