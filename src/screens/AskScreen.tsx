// The Ask tab: a chat with the robot. Type a question or tap a suggestion; the robot answers in
// its own words, sometimes with what its camera saw (tap the picture to see it larger) or a place
// on the map ("Show on map" switches to the Home tab and marks it there). To answer, the robot may
// drive somewhere: meanwhile three dots, and under them what it is doing. One question at a time.
// The header has the robot's name, New chat (starts afresh) and, while the robot moves, Stop, as
// on every tab; under the name, the robot's mode, and a line when the robot can't be reached.
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { dismissNotice } from '../robot/actionsStore';
import { askRobot, startNewChat } from '../robot/ask';
import { type ChatBubble, doingLine, MAX_QUESTION_LENGTH } from '../robot/chat';
import { chipsFor } from '../robot/chatChips';
import { useChat } from '../robot/chatStore';
import { showMark } from '../robot/markStore';
import { modeLook } from '../robot/modes';
import { isFresh, useRobot } from '../robot/store';
import { Icon } from '../ui/icons';
import { NoticeCard } from '../ui/NoticeCard';
import { useNow } from '../ui/parts';
import { useRobotActions } from '../ui/RobotActions';
import { RobotPicture } from '../ui/RobotPicture';
import { swapViews, useStage } from '../ui/stageStore';
import { colors, fonts, radius, spacing } from '../ui/theme';

const LINE_HEIGHT = 22; // of the text field; it grows to three lines, then scrolls
const INPUT_PADDING = 12; // above and below the text: one line makes the field 48 high
const THUMBNAIL_MAX_WIDTH = 248;
const THUMBNAIL_MAX_HEIGHT = 186;
const HEADER_HIT = { top: 4, bottom: 4 }; // the 40 high header buttons, made 48 to touch

// Colours from the design that the theme has no name for.
const LIGHT_EDGE = '#e3e8e6'; // the edge of the robot's bubbles
const PROBLEM_EDGE = '#fcd34d'; // the edge of a bubble with no answer
const DOT_SHADES = [colors.primary, '#5fa3a9', '#b5d3d5']; // the thinking dots, darkest first
const CHIP_FILL = '#f2f8f8';
const CHIP_EDGE = '#b9d3d4';
const INPUT_FILL = '#f7f9f8';
const VIEWER_SCRIM = 'rgba(0,0,0,0.85)'; // behind a picture seen larger
const VIEWER_HINT = '#e5e7eb';

/** Three dots, the dark one moving along: the robot is working on the answer. */
function Dots() {
  const now = useNow(350);
  const lit = Math.floor(now / 350) % 3;
  return (
    <View style={styles.dots} accessibilityLabel="The robot is thinking">
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.dot, { backgroundColor: DOT_SHADES[(i - lit + 3) % 3] }]} />
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
      {bubble.problem || bubble.text ? (
        <View style={styles.words}>
          {bubble.problem ? <Text style={styles.problemTitle}>No answer</Text> : null}
          {bubble.text ? <Text style={styles.theirsText}>{bubble.text}</Text> : null}
        </View>
      ) : null}
      {picture ? (
        <Pressable
          onPress={() => onPicture(picture)}
          accessibilityRole="imagebutton"
          accessibilityLabel="What the robot saw. Tap to see it larger"
          style={styles.picture}
        >
          <View pointerEvents="none">
            <RobotPicture bytes={picture} maxWidth={thumbnailWidth} maxHeight={THUMBNAIL_MAX_HEIGHT} />
          </View>
        </Pressable>
      ) : null}
      {mark ? (
        <Pressable
          onPress={() => onShowOnMap(mark)}
          hitSlop={4}
          accessibilityRole="link"
          style={({ pressed }) => [styles.showOnMap, pressed && styles.pressed]}
        >
          <Icon name="goTo" size={16} strokeWidth={2} color={colors.mark} />
          <Text style={styles.showOnMapText}>Show on map</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export function AskScreen() {
  const insets = useSafeAreaInsets();
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
  const noChat = chat.bubbles.length === 0 && !chat.waiting;
  const doing = doingLine(chat, connected && isFresh(status, now) ? status!.value : null);
  const chips = chipsFor({
    connected,
    mode: live ? mode : '',
    cleaning: cleaning.running ? (cleaning.pause.resume ? 'paused' : 'running') : 'none',
    rooms: rooms && rooms.value.mapName === currentMap ? rooms.value.rooms.map((r) => r.name) : [],
  });
  // Stop shows while the robot moves (and while nobody knows whether it does), as on every tab.
  const showStop = controls.stop.enabled || busy === 'stop';
  // The mode in its own colours while the robot is heard from; grey when what it says is old.
  const look = modeLook(mode);
  const failsafe = live && mode === 'failsafe';
  const offline = !connected ? 'Reconnecting… You can ask again once the robot is back.' : !live ? 'No news from the robot' : '';
  const inputMaxHeight = Math.ceil(3 * LINE_HEIGHT * fontScale) + 2 * INPUT_PADDING + 2;
  const thumbnailWidth = Math.min(THUMBNAIL_MAX_WIDTH, Math.round(width * 0.64));

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
      <SafeAreaView style={styles.screen} edges={['left', 'right']}>
        <View style={[styles.header, { paddingTop: 14 + insets.top }]}>
          <View style={styles.headerLine}>
            <View style={[styles.status, { backgroundColor: live ? colors.good : connected ? colors.warning : colors.danger }]} />
            <Text style={styles.name} numberOfLines={1}>
              {hello?.robotName ?? 'Robot'}
            </Text>
            <Pressable
              onPress={startNewChat}
              disabled={noChat}
              hitSlop={HEADER_HIT}
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
              style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}
            >
              <Icon name="newChat" size={16} strokeWidth={2} color={noChat ? colors.muted : colors.primary} />
              <Text style={[styles.newChatText, noChat && styles.off]} numberOfLines={1}>
                New chat
              </Text>
            </Pressable>
            {showStop ? (
              <Pressable
                onPress={stopButton.onPress}
                disabled={!stopButton.enabled}
                hitSlop={HEADER_HIT}
                accessibilityRole="button"
                accessibilityLabel="Stop the robot"
                style={({ pressed }) => [styles.stop, !stopButton.enabled && styles.stopOff, pressed && styles.pressed]}
              >
                <Icon name="stop" size={12} color={stopButton.enabled ? '#ffffff' : colors.stopDisabledText} />
                <Text
                  style={[styles.stopText, !stopButton.enabled && styles.stopTextOff]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {stopButton.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {mode || offline ? (
            <View style={styles.headerLine}>
              {mode ? (
                <View style={[styles.mode, { backgroundColor: failsafe ? look.color : live ? look.background : colors.line }]}>
                  <Text style={[styles.modeText, { color: failsafe ? '#ffffff' : live ? look.color : colors.muted }]} numberOfLines={1}>
                    {look.label.toUpperCase()}
                  </Text>
                </View>
              ) : null}
              {offline ? (
                <Text style={styles.offline} numberOfLines={2}>
                  {offline}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <ScrollView
          ref={list}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        >
          {noChat ? (
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
            <View style={styles.waiting}>
              <View style={styles.thinking}>
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
                  hitSlop={{ top: 3, bottom: 3 }}
                  accessibilityRole="button"
                  accessibilityHint="Asks the robot at once"
                  style={({ pressed }) => [styles.chip, !canAsk && styles.chipOff, pressed && styles.pressed]}
                >
                  <Text style={styles.chipText} numberOfLines={1}>
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
              <Icon name="send" size={20} strokeWidth={2.4} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityRole="button" accessibilityLabel="Close the picture">
          {viewing ? (
            <View pointerEvents="none" style={styles.viewerPicture}>
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
    paddingLeft: 20,
    paddingRight: spacing.l,
    paddingBottom: 10, // the top padding is set in place: 14 below the phone's own top bar, which the header reaches up behind
    gap: 2,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  status: { width: 10, height: 10, borderRadius: 5, marginRight: 2 },
  name: { flex: 1, fontSize: 21, fontFamily: fonts.display, letterSpacing: -0.2, color: colors.text },
  newChat: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.m, borderRadius: 20 },
  newChatText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  off: { color: colors.muted },
  stop: {
    maxWidth: 150,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.danger,
  },
  stopOff: { backgroundColor: colors.stopDisabled },
  stopText: { flexShrink: 1, fontSize: 15, fontFamily: fonts.display, color: '#ffffff', letterSpacing: 1 },
  stopTextOff: { color: colors.stopDisabledText },
  pressed: { opacity: 0.75 },
  mode: { borderRadius: radius.pill, paddingHorizontal: spacing.s, paddingVertical: 2 },
  modeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  offline: { flex: 1, fontSize: 13, color: colors.warning },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.l, paddingTop: spacing.l, paddingBottom: spacing.s, gap: spacing.m, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl, gap: 6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: 'center' },
  bubble: { borderRadius: 18 },
  mine: { alignSelf: 'flex-end', maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  mineText: { fontSize: 15, lineHeight: 21, color: '#ffffff' },
  theirs: {
    alignSelf: 'flex-start',
    maxWidth: '84%',
    padding: spacing.m,
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: LIGHT_EDGE,
    borderBottomLeftRadius: 4,
  },
  problem: { backgroundColor: colors.warningBackground, borderColor: PROBLEM_EDGE },
  words: { gap: 2, paddingHorizontal: 2 },
  theirsText: { fontSize: 15, lineHeight: 22, color: colors.text },
  problemTitle: { fontSize: 12, fontWeight: '700', color: colors.warning },
  picture: { borderRadius: radius.m, overflow: 'hidden', alignSelf: 'flex-start' },
  showOnMap: {
    alignSelf: 'flex-start',
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.m,
    borderRadius: 18,
    backgroundColor: colors.markBackground,
  },
  showOnMapText: { fontSize: 14, fontWeight: '600', color: colors.mark },
  waiting: { alignSelf: 'flex-start', maxWidth: '84%', gap: 6 },
  thinking: {
    alignSelf: 'flex-start',
    width: 64,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: LIGHT_EDGE,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  doing: { fontSize: 13, color: colors.muted, paddingLeft: spacing.xs },
  inputArea: { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, paddingBottom: spacing.m },
  notice: { paddingHorizontal: spacing.l, paddingBottom: spacing.m },
  // 3 above the chips so their 3 px of extra touch room above stays inside the row.
  chips: { gap: spacing.s, paddingHorizontal: spacing.l, paddingTop: 3, paddingBottom: 10 },
  chip: {
    maxWidth: 260,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: CHIP_EDGE,
    backgroundColor: CHIP_FILL,
  },
  chipOff: { opacity: 0.5 },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s, paddingHorizontal: spacing.l },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: INPUT_PADDING,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    color: colors.text,
    backgroundColor: INPUT_FILL,
    textAlignVertical: 'top',
  },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendOff: { backgroundColor: colors.primaryDisabled },
  viewer: { flex: 1, backgroundColor: VIEWER_SCRIM, justifyContent: 'center', alignItems: 'center', padding: spacing.l },
  viewerPicture: { borderRadius: radius.m, overflow: 'hidden' },
  viewerHint: { fontSize: 13, color: VIEWER_HINT, marginTop: spacing.m },
});
