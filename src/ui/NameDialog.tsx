// Asks for a name, then saves under it: a map, a cleaning plan, a room's new name. If the name is
// taken, asks before replacing what has that name. A caller that can also throw the thing away (a
// room) passes onDelete: a red Delete action shows under the buttons, and the caller asks first.
//
// A white card on a dim backdrop; the field's edge turns teal while typing, red when the name will
// not do.

import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from './icons';
import { Button } from './parts';
import { colors, fonts, radius, spacing } from './theme';

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
  onDelete,
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
  onDelete?: () => void; // "Delete <what>": the caller confirms, then closes the dialog
}) {
  const [name, setName] = useState(suggestion);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
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
            cursorColor={colors.primary}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.input, focused && styles.inputFocused, problem ? styles.inputBad : null]}
            onSubmitEditing={() => !problem && !saving && void go(false)}
            returnKeyType="done"
          />
          <Text style={[styles.help, problem ? styles.helpBad : null]}>{problem ?? help}</Text>
          <View style={styles.buttons}>
            <View style={styles.slot}>
              <Button kind="plain" label={backLabel} onPress={onClose} />
            </View>
            <View style={styles.slot}>
              <Button label={saving ? 'Saving…' : saveLabel} onPress={() => void go(false)} disabled={problem !== null || saving} />
            </View>
          </View>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Delete the ${what} ${suggestion}`}
              accessibilityState={{ disabled: saving }}
              style={({ pressed }) => [styles.delete, (pressed || saving) && styles.deleteDim]}
            >
              <Icon name="trash" size={18} color={colors.dangerText} />
              <Text style={styles.deleteText}>Delete {what}</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.card, borderRadius: radius.xxl, padding: 20 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.text, marginBottom: spacing.m },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.field,
    borderRadius: radius.l,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.primary },
  inputBad: { borderColor: colors.danger },
  help: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 6 },
  helpBad: { color: colors.dangerText },
  buttons: { flexDirection: 'row', gap: spacing.s, marginTop: 20 },
  slot: { flex: 1 },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.s, minHeight: 44, marginTop: spacing.s },
  deleteDim: { opacity: 0.6 },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.dangerText },
});
