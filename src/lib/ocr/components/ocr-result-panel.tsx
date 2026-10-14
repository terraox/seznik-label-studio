import { useState, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Palette } from '@/constants/ui';

type OcrResultPanelProps = {
  value: string;
  onChangeText: (text: string) => void;
  inputRef?: Ref<TextInput>;
  errorMessage?: string | null;
  identifying?: boolean;
  onCopy: () => Promise<void> | void;
  onCopyError?: (error: unknown) => void;
};

export function OcrResultPanel({
  value,
  onChangeText,
  inputRef,
  errorMessage,
  identifying = false,
  onCopy,
  onCopyError,
}: OcrResultPanelProps) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    if (copying || identifying) return;
    try {
      setCopying(true);
      await onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      setCopied(false);
      onCopyError?.(error);
    } finally {
      setCopying(false);
    }
  };

  return (
    <View>
      <TextInput
        ref={inputRef}
        style={styles.previewInput}
        value={value}
        onChangeText={onChangeText}
        placeholder=""
        placeholderTextColor="#A4B0BC"
        multiline
        editable={!identifying}
        textAlignVertical="center"
      />

      <View style={styles.copyRow}>
        <Pressable
          onPress={() => {
            void handleCopy();
          }}
          disabled={identifying || copying || !value.trim()}
          style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}
          hitSlop={8}>
          {copying ? (
            <ActivityIndicator size="small" color={Palette.accent} />
          ) : (
            <Text style={[styles.copyText, !value.trim() && styles.copyDisabled]}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          )}
        </Pressable>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  previewInput: {
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: '#EEF1F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2C3E50',
    marginBottom: 8,
  },
  copyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  copyBtn: {
    minHeight: 32,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  copyText: {
    color: Palette.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  copyDisabled: {
    color: Palette.disabled,
  },
  errorText: {
    color: Palette.danger,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  pressed: {
    opacity: 0.72,
  },
});
