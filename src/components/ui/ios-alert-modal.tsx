import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';

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
}: IosAlertModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const handleBack = onRequestClose ?? onClose;
  const handleBackdrop = dismissOnBackdrop ? (onClose ?? onRequestClose) : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleBack}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}>
        <Pressable style={styles.backdrop} onPress={handleBackdrop} />
        <View style={[styles.card, { maxWidth: cardMaxWidth, maxHeight: Math.round(windowHeight * 0.8) }]}>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function IosAlertInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#8E8E93"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
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
    color: '#000000',
    textAlign: 'center',
    lineHeight: 22,
  },
  message: {
    fontSize: 13,
    fontWeight: '400',
    color: '#3C3C43',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  input: {
    width: '100%',
    height: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    borderRadius: 7,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#000000',
    marginTop: 12,
  },
  actionRowHorizontal: {
    flexDirection: 'row',
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
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
    backgroundColor: '#D1D1D6',
    height: '100%',
  },
  actionRowVertical: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
  },
  verticalBtnWrapper: {
    width: '100%',
  },
  horizontalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D1D1D6',
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
    color: '#007AFF',
    textAlign: 'center',
  },
  btnTextBold: {
    fontWeight: '600',
  },
  btnTextCancel: {
    color: '#007AFF',
    fontWeight: '400',
  },
  btnTextDestructive: {
    color: '#FF3B30',
    fontWeight: '400',
  },
  btnPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  btnDisabled: {
    opacity: 0.35,
  },
});
