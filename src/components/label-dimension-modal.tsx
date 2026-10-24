import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { TextInput } from '@/components/ui/text-input';

import {
  fromMm,
  MAX_LABEL_MM,
  MIN_LABEL_MM,
  parseSizeInput,
  toMm,
  validateLabelSize,
  type LabelUnit,
} from '@/lib/label-geometry';
import { themedStyles, useThemeRefresh } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

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
  useThemeRefresh();
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
      // Leave the layout alone while the modal fades out: resetting the keyboard padding or
      // swapping the input for a blank box here made the card jump (flicker) as it closed.
      clearFocusTimers();
    }
  }, [visible, valueMm, unit, clearFocusTimers]);

  // Start each opening from a clean layout instead.
  useEffect(() => {
    if (!visible) return;
    setKeyboardHeight(0);
    setInputReady(false);
  }, [visible]);

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
      supportedOrientations={ALL_ORIENTATIONS}
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

const styles = themedStyles((c) => ({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrim,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: c.textSecondary,
    textAlign: 'center',
    marginTop: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: c.hairline,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '500',
    color: c.text,
    backgroundColor: c.fill,
    textAlign: 'center',
  },
  inputError: {
    borderColor: c.danger,
  },
  error: {
    fontSize: 12,
    color: c.danger,
    textAlign: 'center',
  },
  unitHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
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
    backgroundColor: c.fillStrong,
    alignItems: 'center',
  },
  unitChipOn: {
    backgroundColor: c.accentFill,
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  unitChipTextOn: {
    color: c.onAccent,
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
    backgroundColor: c.fillStrong,
  },
  doneBtn: {
    backgroundColor: c.accentFill,
  },
  doneBtnDisabled: {
    backgroundColor: c.textDisabled,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textSecondary,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.onAccent,
  },
  doneTextDisabled: {
    color: c.textDisabled,
  },
  pressed: {
    opacity: 0.85,
  },
}));
