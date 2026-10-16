import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ElementAnchorRect } from '@/lib/editor/quick-value';
import { C, themedStyles, useThemeRefresh } from '@/theme';


/** Ignore backdrop taps briefly so the leftover double-tap doesn't dismiss or blur the input. */
const BACKDROP_ARM_MS = 400;

export type QuickValueModalProps = {
  visible: boolean;
  initialValue: string;
  title?: string;
  placeholder?: string;
  anchorRect?: ElementAnchorRect;
  onCancel: () => void;
  onConfirm: (newValue: string) => void;
};

export function QuickValueModal({
  visible,
  initialValue,
  title,
  placeholder,
  anchorRect,
  onCancel,
  onConfirm,
}: QuickValueModalProps) {
  useThemeRefresh();
  const [draft, setDraft] = useState(initialValue);
  const [cardHeight, setCardHeight] = useState(200);
  const [backdropArmed, setBackdropArmed] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const openTimeRef = useRef(0);
  const focusCleanupRef = useRef<(() => void) | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const clearFocusTimers = useCallback(() => {
    focusCleanupRef.current?.();
    focusCleanupRef.current = null;
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
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
    const t2 = setTimeout(focusInput, Platform.OS === 'android' ? 200 : 120);
    const tArm = setTimeout(() => setBackdropArmed(true), BACKDROP_ARM_MS);

    focusCleanupRef.current = () => {
      afterInteractions.cancel();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(tArm);
    };
  }, [clearFocusTimers, focusInput]);

  useEffect(() => {
    if (!visible) {
      clearFocusTimers();
      setBackdropArmed(false);
      return;
    }

    setDraft(initialValue);
    openTimeRef.current = Date.now();
    setBackdropArmed(false);
    scheduleFocus();
  }, [visible, initialValue, clearFocusTimers, scheduleFocus]);

  useEffect(() => () => clearFocusTimers(), [clearFocusTimers]);

  const handleClear = () => {
    setDraft('');
    focusInput();
  };

  const handleConfirm = () => {
    onConfirm(draft);
  };

  const handleBackdropPress = () => {
    if (!backdropArmed || Date.now() - openTimeRef.current < BACKDROP_ARM_MS) {
      focusInput();
      return;
    }
    onCancel();
  };

  if (!visible) {
    return null;
  }

  const cardWidth = Math.min(340, Math.max(280, windowWidth - 32));
  const minTop = 64;

  let cardTop = minTop + 8;
  let cardLeft = (windowWidth - cardWidth) / 2;

  if (anchorRect && anchorRect.y > 0) {
    const elementCenterX = anchorRect.x + anchorRect.width / 2;
    cardLeft = Math.max(16, Math.min(windowWidth - cardWidth - 16, elementCenterX - cardWidth / 2));

    const aboveY = anchorRect.y - cardHeight - 12;
    const maxTop = Math.max(minTop + 8, windowHeight - cardHeight - 320);
    if (aboveY >= minTop) {
      cardTop = Math.min(aboveY, maxTop);
    } else {
      cardTop = minTop + 8;
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.overlay}
      pointerEvents="box-none"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      <Pressable
        style={styles.backdrop}
        onPress={handleBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={[
          styles.card,
          {
            position: 'absolute',
            top: cardTop,
            left: cardLeft,
            width: cardWidth,
          },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - cardHeight) > 4) {
            setCardHeight(h);
          }
        }}>
        {!!title && <Text style={styles.cardTitle}>{title}</Text>}

        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            showSoftInputOnFocus
            multiline
            placeholder={placeholder || 'Enter value'}
            placeholderTextColor={C.textMuted}
            selectionColor={C.accent}
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            onLayout={scheduleFocus}
          />
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            onPress={onCancel}
            hitSlop={12}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={handleClear}
            hitSlop={12}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>

          <Pressable
            onPress={handleConfirm}
            hitSlop={12}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}>
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrim,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
    zIndex: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    marginBottom: 12,
  },
  inputContainer: {
    width: '100%',
    minHeight: 80,
    maxHeight: 160,
    backgroundColor: c.fill,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  input: {
    fontSize: 16,
    color: c.text,
    textAlignVertical: 'top',
    minHeight: 60,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.6,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textMuted,
  },
  clearText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.danger,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.accent,
  },
}));
