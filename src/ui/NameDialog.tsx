// Asks for a name, then saves under it: a map, a cleaning plan, a room's new name. If the name is
// taken, asks before replacing what has that name.

import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from './theme';

export type SaveAnswer = 'saved' | 'name_taken' | 'failed';

export function NameDialog({
  visible,
  title,
  suggestion,
  help,
  backLabel,
  what,
  autoCapitalize = 'none',
  saveLabel = 'Save',
  problemOf,
  save,
  onClose,
}: {
  visible: boolean;
  title: string; // "Save the map"
  suggestion: string;
  help: string; // under the field while the name is good
  backLabel: string; // the button that closes without saving
  what: string; // "map", "plan": for the question before replacing
  autoCapitalize?: 'none' | 'sentences' | 'words';
  saveLabel?: string; // the button that saves: "Save", "Rename"
  problemOf: (name: string) => string | null;
  save: (name: string, replace: boolean) => Promise<SaveAnswer>;
  onClose: () => void;
}) {
  const [name, setName] = useState(suggestion);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (visible) setName(suggestion);
  }, [visible, suggestion]);
  const problem = problemOf(name);

  async function go(replace: boolean) {
    setSaving(true);
    const result = await save(name, replace);
    setSaving(false);
    if (result === 'name_taken') {
      Alert.alert(`Replace '${name.trim()}'?`, `A ${what} with this name already exists. Replacing it loses the old one.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => void go(true) },
      ]);
      return;
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            maxLength={40}
            style={[styles.input, problem ? styles.inputBad : null]}
            onSubmitEditing={() => !problem && !saving && void go(false)}
            returnKeyType="done"
          />
          <Text style={[styles.help, problem ? styles.helpBad : null]}>{problem ?? help}</Text>
          <View style={styles.buttons}>
            <Pressable onPress={onClose} style={[styles.button, styles.cancel]} accessibilityRole="button">
              <Text style={styles.cancelText}>{backLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => void go(false)}
              disabled={problem !== null || saving}
              style={[styles.button, styles.save, (problem !== null || saving) && styles.disabled]}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : saveLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.card, borderRadius: 14, padding: spacing.l },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.m },
  label: { fontSize: 13, color: colors.muted, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.m, height: 46, fontSize: 16, color: colors.text },
  inputBad: { borderColor: colors.danger },
  help: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  helpBad: { color: colors.danger },
  buttons: { flexDirection: 'row', gap: spacing.m, marginTop: spacing.l },
  button: { flex: 1, height: 46, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cancel: { borderWidth: 1, borderColor: colors.border },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.text },
  save: { backgroundColor: colors.primary },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.45 },
});
