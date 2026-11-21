// The first screen: type the PC's address and connect. The address is remembered.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { parseAddress } from '../robot/address';
import { connectTo, disconnect } from '../robot/client';
import { useRobot } from '../robot/store';
import { Button } from '../ui/parts';
import { colors, spacing } from '../ui/theme';

const ADDRESS_KEY = 'gateway_address';

export function ConnectScreen() {
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
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
      <Text style={styles.title}>MOTEbot</Text>
      <Text style={styles.subtitle}>Connect to the PC that runs the robot.</Text>

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setInputError(null);
        }}
        placeholder="PC address, e.g. 192.168.0.102"
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
        <View>
          <Text style={styles.status}>
            Connecting to {address}
            {connection.attempt > 1 ? ` (attempt ${connection.attempt})` : ''}…
          </Text>
          {connection.problem ? <Text style={styles.problem}>Last attempt: {connection.problem}</Text> : null}
        </View>
      ) : null}
      {connection.kind === 'incompatible' ? <Text style={styles.error}>{connection.message}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, paddingTop: 64 },
  title: { fontSize: 34, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.xl },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.m,
    fontSize: 17,
    backgroundColor: colors.card,
    color: colors.text,
  },
  hint: { fontSize: 13, color: colors.muted, marginTop: spacing.s },
  buttons: { marginTop: spacing.l },
  status: { fontSize: 15, color: colors.text, marginTop: spacing.l },
  problem: { fontSize: 14, color: colors.muted, marginTop: spacing.xs },
  error: { fontSize: 15, color: colors.danger, marginTop: spacing.l },
});
