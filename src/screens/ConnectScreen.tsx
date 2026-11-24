// The first screen: a drawing of the robot and its name, then type the PC's address and connect.
// The address is remembered. While trying, a small card says to where and how the last try went.
// At the bottom, the app's version and message format.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { parseAddress } from '../robot/address';
import { connectTo, disconnect } from '../robot/client';
import { useRobot } from '../robot/store';
import { PROTOCOL_VERSION } from '../transport/messages';
import { Button } from '../ui/parts';
import { colors, fonts, radius, spacing } from '../ui/theme';
import { APP_VERSION } from '../version';

const ADDRESS_KEY = 'gateway_address';

const WHITE = '#ffffff';
const INNER_RING = 'rgba(255,255,255,0.28)'; // the faint ring on the robot's top
const DUST = '#9aa6a2'; // the specks of dust in front of the robot

/** The robot seen from above, about to pick up three specks of dust. */
function RobotDrawing() {
  return (
    <Svg width={96} height={96} viewBox="0 0 96 96" accessible={false} importantForAccessibility="no-hide-descendants">
      <Circle cx={40} cy={48} r={34} fill={colors.primary} />
      <Circle cx={40} cy={48} r={25} fill="none" stroke={INNER_RING} strokeWidth={2} />
      <Path d="M70 32 A34 34 0 0 1 70 64" fill="none" stroke={WHITE} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={58} cy={48} r={4} fill={WHITE} />
      <Circle cx={84} cy={30} r={2.5} fill={DUST} />
      <Circle cx={90} cy={46} r={1.8} fill={DUST} />
      <Circle cx={85} cy={62} r={2.2} fill={DUST} />
    </Svg>
  );
}

export function ConnectScreen() {
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const connection = useRobot((s) => s.connection);
  const address = useRobot((s) => s.address);
  const trying = connection.kind === 'connecting';

  useEffect(() => {
    AsyncStorage.getItem(ADDRESS_KEY)
      .then((saved) => saved && setText((current) => current || saved))
      .catch(() => {}); // nothing saved, or storage unavailable: the field stays empty
  }, []);

  function connect() {
    const parsed = parseAddress(text);
    if ('error' in parsed) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    AsyncStorage.setItem(ADDRESS_KEY, text.trim()).catch(() => {});
    connectTo(parsed);
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Scrolls only when the keyboard leaves too little room; taps on Connect still work with the keyboard up. */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.drawing}>
          <RobotDrawing />
        </View>
        <Text style={styles.title}>
          MOTE<Text style={styles.titleBot}>bot</Text>
        </Text>
        <Text style={styles.subtitle}>Connect to the PC that runs the robot.</Text>

        <Text style={styles.label} importantForAccessibility="no">
          PC address
        </Text>
        <TextInput
          style={[styles.input, focused ? styles.inputFocused : null]}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setInputError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="e.g. 192.168.0.102"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!trying}
          onSubmitEditing={connect}
          accessibilityLabel="PC address"
        />
        <Text style={styles.hint}>On the phone's Wi-Fi network. In the emulator the PC is 10.0.2.2.</Text>

        <View style={styles.buttons}>
          {trying ? <Button label="Cancel" kind="plain" onPress={disconnect} /> : <Button label="Connect" onPress={connect} />}
        </View>

        {inputError ? <Text style={styles.error}>{inputError}</Text> : null}
        {connection.kind === 'connecting' ? (
          <View style={styles.trying}>
            <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
            <View style={styles.tryingText}>
              <Text style={styles.status}>
                Connecting to {address}
                {connection.attempt > 1 ? ` (attempt ${connection.attempt})` : ''}…
              </Text>
              {connection.problem ? <Text style={styles.problem}>Last attempt: {connection.problem}</Text> : null}
            </View>
          </View>
        ) : null}
        {connection.kind === 'incompatible' ? <Text style={styles.error}>{connection.message}</Text> : null}

        <View style={styles.spacer} />
        <Text style={styles.footer}>
          App {APP_VERSION} · message format {PROTOCOL_VERSION}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 88, paddingBottom: 32 },
  drawing: { marginBottom: 28 },
  title: { fontFamily: fonts.display, fontSize: 44, letterSpacing: -1, color: colors.text },
  titleBot: { fontFamily: fonts.displayMedium, color: colors.primary },
  subtitle: { fontSize: 17, lineHeight: 25, color: colors.muted, marginTop: spacing.m, marginBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.s },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.field,
    borderRadius: radius.l,
    paddingHorizontal: spacing.l,
    fontSize: 18,
    fontWeight: '500',
    backgroundColor: colors.card,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.primary },
  hint: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 10, marginHorizontal: 2 },
  buttons: { marginTop: 28 },
  trying: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.m,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: spacing.l,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  spinner: { marginTop: 1 },
  tryingText: { flex: 1, gap: 2 },
  status: { fontSize: 15, fontWeight: '600', color: colors.text },
  problem: { fontSize: 13, color: colors.muted },
  error: { fontSize: 15, color: colors.dangerText, marginTop: spacing.l },
  spacer: { flex: 1, minHeight: spacing.xl },
  footer: { fontSize: 12, color: colors.muted, textAlign: 'center' },
});
