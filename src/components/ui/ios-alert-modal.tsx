import React, { type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { TextInput } from '@/components/ui/text-input';

import { makeStyles, useColors, useScheme } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

export type IosAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  bold?: boolean;
  disabled?: boolean;
};

export type IosAlertModalProps = {
  visible: boolean;
  onClose?: () => void;
  title?: string;
  message?: string;
  children?: ReactNode;
  buttons?: IosAlertButton[];
  onRequestClose?: () => void;
  /** Tap outside the card. Hardware back still uses `onRequestClose` or `onClose`. */
  dismissOnBackdrop?: boolean;
  cardMaxWidth?: number;
  /**
   * Compact form mode for dialogs that hold a text field. The card is sized to its content with no
   * keyboard avoidance (avoids Android stretch that hides buttons). Use `cardAlign` for placement.
   */
  plainScroll?: boolean;
  /** Where the card sits when `plainScroll` is on. Default `top` keeps the field above the keyboard. */
  cardAlign?: 'center' | 'top';
};

export function IosAlertModal({
  visible,
  onClose,
  title,
  message,
  children,
  buttons = [{ text: 'OK', style: 'default', bold: true }],
  onRequestClose,
  dismissOnBackdrop = true,
  cardMaxWidth = 280,
  plainScroll = false,
  cardAlign = 'top',
}: IosAlertModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const styles = useStyles();
  const handleBack = onRequestClose ?? onClose;
  const handleBackdrop = dismissOnBackdrop ? (onClose ?? onRequestClose) : undefined;
  const Overlay = plainScroll ? View : KeyboardAvoidingView;

  return (
    <Modal
      supportedOrientations={ALL_ORIENTATIONS}
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleBack}>
      <Overlay
        {...(plainScroll ? {} : { behavior: 'padding' as const, keyboardVerticalOffset: Platform.OS === 'ios' ? 20 : 0 })}
        style={[styles.overlay, plainScroll && cardAlign === 'top' && styles.overlayTop]}>
        <Pressable style={styles.backdrop} onPress={handleBackdrop} />
        <View
          style={[
            styles.card,
            { maxWidth: cardMaxWidth },
            { maxHeight: Math.round(windowHeight * (plainScroll ? 0.88 : 0.8)) - (plainScroll && cardAlign === 'top' ? 72 : 0) },
          ]}>
          {plainScroll ? (
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}>
              {!!title && <Text style={styles.title}>{title}</Text>}
              {!!message && <Text style={styles.message}>{message}</Text>}
              {children}
            </ScrollView>
          ) : (
            <FormScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}>
              {!!title && <Text style={styles.title}>{title}</Text>}
              {!!message && <Text style={styles.message}>{message}</Text>}
              {children}
            </FormScrollView>
          )}

          {/* Buttons footer */}
          {buttons.length === 2 ? (
            <View style={styles.actionRowHorizontal}>
              <Pressable
                disabled={buttons[0].disabled}
                onPress={buttons[0].onPress ?? onClose}
                style={({ pressed }) => [
                  styles.btnHorizontal,
                  pressed && styles.btnPressed,
                  buttons[0].disabled && styles.btnDisabled,
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.btnText,
                    buttons[0].style === 'destructive' && styles.btnTextDestructive,
                    buttons[0].style === 'cancel' && styles.btnTextCancel,
                    buttons[0].bold && styles.btnTextBold,
                  ]}>
                  {buttons[0].text}
                </Text>
              </Pressable>

              <View style={styles.verticalDivider} />

              <Pressable
                disabled={buttons[1].disabled}
                onPress={buttons[1].onPress ?? onClose}
                style={({ pressed }) => [
                  styles.btnHorizontal,
                  pressed && styles.btnPressed,
                  buttons[1].disabled && styles.btnDisabled,
                ]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.btnText,
                    buttons[1].style === 'destructive' && styles.btnTextDestructive,
                    buttons[1].style === 'cancel' && styles.btnTextCancel,
                    (buttons[1].bold ?? buttons[1].style !== 'cancel') && styles.btnTextBold,
                  ]}>
                  {buttons[1].text}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actionRowVertical}>
              {buttons.map((btn, index) => (
                <View key={index} style={styles.verticalBtnWrapper}>
                  {index > 0 && <View style={styles.horizontalDivider} />}
                  <Pressable
                    disabled={btn.disabled}
                    onPress={btn.onPress ?? onClose}
                    style={({ pressed }) => [
                      styles.btnVertical,
                      pressed && styles.btnPressed,
                      btn.disabled && styles.btnDisabled,
                    ]}>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.btnText,
                        btn.style === 'destructive' && styles.btnTextDestructive,
                        btn.style === 'cancel' && styles.btnTextCancel,
                        btn.bold && styles.btnTextBold,
                      ]}>
                      {btn.text}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </Overlay>
    </Modal>
  );
}

export function IosAlertInput(props: TextInputProps) {
  const c = useColors();
  const scheme = useScheme();
  const styles = useStyles();
  return (
    <TextInput
      placeholderTextColor={c.textMuted}
      keyboardAppearance={scheme}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const useStyles = makeStyles((c, scheme) => ({
  overlay: {
    flex: 1,
    backgroundColor: c.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  overlayTop: {
    justifyContent: 'flex-start',
    paddingTop: 72,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    backgroundColor: c.raised,
    borderRadius: 14,
    overflow: 'hidden',
    ...(scheme === 'dark'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline }
      : {
          shadowColor: c.shadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
          elevation: 8,
        }),
  },
  bodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  body: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 18,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  message: {
    fontSize: 13,
    fontWeight: '400',
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  input: {
    width: '100%',
    height: 36,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    fontSize: 14,
    color: c.text,
    marginTop: 12,
  },
  actionRowHorizontal: {
    flexDirection: 'row',
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
    height: 45,
  },
  btnHorizontal: {
    flex: 1,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  verticalDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    height: '100%',
  },
  actionRowVertical: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  verticalBtnWrapper: {
    width: '100%',
  },
  horizontalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    width: '100%',
  },
  btnVertical: {
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btnText: {
    fontSize: 17,
    fontWeight: '400',
    color: c.link,
    textAlign: 'center',
  },
  btnTextBold: {
    fontWeight: '600',
  },
  btnTextCancel: {
    color: c.link,
    fontWeight: '400',
  },
  btnTextDestructive: {
    color: c.danger,
    fontWeight: '400',
  },
  btnPressed: {
    backgroundColor: c.pressedOverlay,
  },
  btnDisabled: {
    opacity: 0.35,
  },
}));
