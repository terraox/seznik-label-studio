import { useState, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from 'react-native';
import { TextInput } from '@/components/ui/text-input';
import { C, themedStyles, useThemeRefresh } from '@/theme';

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
  useThemeRefresh();
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
        placeholderTextColor={C.textMuted}
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
            <ActivityIndicator size="small" color={C.accent} />
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

const styles = themedStyles((c) => ({
  previewInput: {
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: c.fillStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: c.textSecondary,
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
    color: c.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  copyDisabled: {
    color: c.textDisabled,
  },
  errorText: {
    color: c.danger,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  pressed: {
    opacity: 0.72,
  },
}));
