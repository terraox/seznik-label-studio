import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Palette } from '@/constants/ui';
import {
  fromMm,
  MAX_LABEL_MM,
  MIN_LABEL_MM,
  parseSizeInput,
  toMm,
  validateLabelSize,
  type LabelUnit,
} from '@/lib/label-geometry';

const KEYBOARD_GAP = 32;

const UNITS: { id: LabelUnit; label: string }[] = [
  { id: 'mm', label: 'mm' },
  { id: 'cm', label: 'cm' },
  { id: 'in', label: 'inch' },
];

function formatField(mm: number, unit: LabelUnit): string {
  const v = fromMm(mm, unit);
  if (unit === 'in') return String(Math.round(v * 100) / 100);
  if (unit === 'cm') return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

type LabelDimensionModalProps = {
  visible: boolean;
  title: string;
  valueMm: number;
  otherMm: number;
  axis: 'width' | 'height';
  unit: LabelUnit;
  onUnitChange: (unit: LabelUnit) => void;
  onClose: () => void;
  onConfirm: (valueMm: number) => void;
};

export function LabelDimensionModal({
  visible,
  title,
  valueMm,
  otherMm,
  axis,
  unit,
  onUnitChange,
  onClose,
  onConfirm,
}: LabelDimensionModalProps) {
  const [text, setText] = useState(() => formatField(valueMm, unit));
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputReady, setInputReady] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const focusCleanupRef = useRef<(() => void) | null>(null);
  const { height: windowHeight } = useWindowDimensions();

  const clearFocusTimers = useCallback(() => {
    focusCleanupRef.current?.();
    focusCleanupRef.current = null;
  }, []);

  const scheduleFocus = useCallback(() => {
    clearFocusTimers();
    const runFocus = () => {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    };
    const afterInteractions = InteractionManager.runAfterInteractions(runFocus);
    const t1 = setTimeout(runFocus, 50);
    const t2 = setTimeout(runFocus, Platform.OS === 'android' ? 280 : 120);
    const t3 = setTimeout(runFocus, Platform.OS === 'android' ? 500 : 250);
    focusCleanupRef.current = () => {
      afterInteractions.cancel();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [clearFocusTimers]);

  useEffect(() => {
    if (visible) {
      setText(formatField(valueMm, unit));
    } else {
      setKeyboardHeight(0);
      setInputReady(false);
      clearFocusTimers();
    }
  }, [visible, valueMm, unit, clearFocusTimers]);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const fromHeight = e.endCoordinates.height;
        const fromScreenY = windowHeight - e.endCoordinates.screenY;
        setKeyboardHeight(Math.max(fromHeight, fromScreenY, 0));
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible, windowHeight]);

  const error = useMemo(() => {
    const parsed = parseSizeInput(text);
    if (parsed == null) return 'Enter a valid number.';
    const nextMm = toMm(parsed, unit);
    const widthMm = axis === 'width' ? nextMm : otherMm;
    const heightMm = axis === 'height' ? nextMm : otherMm;
    return validateLabelSize(widthMm, heightMm);
  }, [text, unit, axis, otherMm]);

  const handleConfirm = () => {
    const parsed = parseSizeInput(text);
    if (parsed == null) return;
    const nextMm = toMm(parsed, unit);
    const widthMm = axis === 'width' ? nextMm : otherMm;
    const heightMm = axis === 'height' ? nextMm : otherMm;
    if (validateLabelSize(widthMm, heightMm)) return;
    onConfirm(nextMm);
    onClose();
  };

  const switchUnit = (next: LabelUnit) => {
    const parsed = parseSizeInput(text);
    const mm = parsed != null ? toMm(parsed, unit) : valueMm;
    onUnitChange(next);
    setText(formatField(mm, next));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => {
        setInputReady(true);
        scheduleFocus();
      }}>
      <View
        style={[
          styles.overlay,
          keyboardHeight > 0
            ? { justifyContent: 'flex-end', paddingBottom: keyboardHeight + KEYBOARD_GAP }
            : { justifyContent: 'center', paddingBottom: 24 },
        ]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card} pointerEvents="box-none">
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {axis === 'width' ? 'Label width' : 'Label height'} · {MIN_LABEL_MM}–{MAX_LABEL_MM} mm
            </Text>

            {inputReady ? (
              <TextInput
                ref={inputRef}
                style={[styles.input, error ? styles.inputError : null]}
                keyboardType="decimal-pad"
                value={text}
                onChangeText={setText}
                autoFocus
                showSoftInputOnFocus
                selectTextOnFocus
                blurOnSubmit={false}
              />
            ) : (
              <View style={styles.input} />
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.unitHeading}>Unit</Text>
            <View style={styles.unitRow}>
              {UNITS.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => switchUnit(item.id)}
                  style={[styles.unitChip, unit === item.id && styles.unitChipOn]}>
                  <Text style={[styles.unitChipText, unit === item.id && styles.unitChipTextOn]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.actionBtn, styles.cancelBtn, pressed && styles.pressed]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={Boolean(error)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.doneBtn,
                  Boolean(error) && styles.doneBtnDisabled,
                  pressed && !error && styles.pressed,
                ]}>
                <Text style={[styles.doneText, Boolean(error) && styles.doneTextDisabled]}>Done</Text>
              </Pressable>
            </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Palette.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '500',
    color: Palette.ink,
    backgroundColor: '#F8FAFC',
    textAlign: 'center',
  },
  inputError: {
    borderColor: '#DC2626',
  },
  error: {
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
  },
  unitHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  unitChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
  },
  unitChipOn: {
    backgroundColor: Palette.accent,
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.ink,
  },
  unitChipTextOn: {
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#EEF2F6',
  },
  doneBtn: {
    backgroundColor: Palette.accent,
  },
  doneBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  doneTextDisabled: {
    color: '#F8FAFC',
  },
  pressed: {
    opacity: 0.85,
  },
});
