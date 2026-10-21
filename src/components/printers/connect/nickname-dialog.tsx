import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { TextInput } from '@/components/ui/text-input';
import { Spacing } from '@/constants/theme';
import { PRINTER_NICKNAME_MAX } from '@/stores/printer-store';
import { cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type NicknameDialogProps = {
  visible: boolean;
  /** Current nickname, or null when none is set. */
  nickname: string | null;
  /** The printer's own Bluetooth name, shown as a hint. */
  deviceName: string | null;
  onSave: (nickname: string | null) => void;
  onClose: () => void;
};

export function NicknameDialog({ visible, nickname, deviceName, onSave, onClose }: NicknameDialogProps) {
  useThemeRefresh();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(nickname ?? '');
  }, [visible, nickname]);

  const trimmed = value.trim();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.dialog}>
          <Text style={styles.title}>Printer nickname</Text>
          {deviceName ? <Text style={styles.hint}>Bluetooth name: {deviceName}</Text> : null}
          <TextInput
            value={value}
            onChangeText={setValue}
            maxLength={PRINTER_NICKNAME_MAX}
            placeholder="e.g. Shop counter"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => onSave(trimmed || null)}
            style={styles.input}
          />
          <Pressable
            onPress={() => onSave(trimmed || null)}
            style={({ pressed }) => [styles.save, pressed && styles.pressed]}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
          {nickname ? (
            <Pressable onPress={() => onSave(null)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <Text style={styles.linkText}>Remove nickname</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onClose} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles((c, scheme) => ({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: c.scrim },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: Spacing.four,
    gap: 10,
    ...cardElevation(c, scheme),
  },
  title: { fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' },
  hint: { fontSize: 13, color: c.textMuted, textAlign: 'center' },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.fill,
  },
  save: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: c.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  link: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: c.danger, fontSize: 14, fontWeight: '600' },
  cancelText: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.7 },
}));
