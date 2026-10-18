import { Image } from 'expo-image';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextInput as RNTextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { AppIcon } from '@/components/app-icon';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const AUTH_COLORS = {
  navy: '#12295C',
  blue: '#0A8CF0',
  text: '#0F172A',
  muted: '#64748B',
  border: '#D7DEE9',
  field: '#F5F7FB',
  error: '#DC2626',
  success: '#16A34A',
  background: '#FFFFFF',
};

export function AuthScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <FormScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
        <View style={styles.blobLarge} />
        <View style={styles.blobSmall} />
        <View style={styles.logoTile}>
          <Image
            source={require('../../../assets/images/logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.form}>{children}</View>
      </View>
    </FormScrollView>
  );
}

export function AuthField({
  label,
  error,
  prefix,
  right,
  icon,
  onFocus,
  onBlur,
  ...input
}: TextInputProps & {
  label: string;
  error?: string | null;
  prefix?: string;
  right?: ReactNode;
  icon?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}>
        {icon ? (
          <AppIcon
            name={icon}
            size={18}
            tintColor={focused ? AUTH_COLORS.blue : '#94A3B8'}
            style={styles.fieldIcon}
          />
        ) : null}
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          style={styles.input}
          placeholderTextColor="#94A3B8"
          selectionColor={AUTH_COLORS.blue}
          cursorColor={AUTH_COLORS.blue}
          selectTextOnFocus={false}
          autoCapitalize="none"
          autoCorrect={false}
          // Autofill paints these fields yellow; only the OTP boxes use it.
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...input}
        />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Six boxes over one hidden input. Autofills the SMS code and calls onComplete when full. */
export function OtpBoxes({
  value,
  onChange,
  onComplete,
  length,
  error,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length: number;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const ref = useRef<RNTextInput>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const change = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <View style={styles.fieldWrap}>
      <Pressable style={styles.otpRow} onPress={() => ref.current?.focus()}>
        {Array.from({ length }, (_, i) => {
          const active = focused && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={[
                styles.otpBox,
                active && styles.otpBoxActive,
                !!error && styles.fieldError,
              ]}>
              <Text style={styles.otpDigit}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          maxLength={length}
          selectTextOnFocus={false}
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          caretHidden
          style={styles.otpHidden}
        />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segmentItem, o.value === value && styles.segmentItemOn]}>
          <Text style={[styles.segmentText, o.value === value && styles.segmentTextOn]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LinkText({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
      <Text style={[styles.link, disabled && { color: AUTH_COLORS.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function DevBypassButton({
  label = 'Developer Bypass',
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.devButton,
        pressed && styles.devButtonPressed,
      ]}>
      <Text style={styles.devButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_COLORS.navy },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: AUTH_COLORS.navy,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 44,
    overflow: 'hidden',
  },
  blobLarge: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: AUTH_COLORS.blue,
    opacity: 0.18,
    top: -90,
    right: -70,
  },
  blobSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: AUTH_COLORS.blue,
    opacity: 0.12,
    bottom: -40,
    left: -40,
  },
  logoTile: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: { width: 76, height: 76 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 18,
  },
  subtitle: {
    fontSize: 14,
    color: '#B9C7E6',
    textAlign: 'center',
    marginTop: 6,
  },
  sheet: {
    flexGrow: 1,
    backgroundColor: AUTH_COLORS.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -24,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  form: { gap: 16 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: AUTH_COLORS.navy },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 58,
  },
  fieldFocused: { borderColor: AUTH_COLORS.blue, backgroundColor: '#F4F9FF' },
  fieldError: { borderColor: AUTH_COLORS.error },
  fieldIcon: { marginRight: 10 },
  prefix: { fontSize: 16, color: AUTH_COLORS.text, fontWeight: '600', marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: AUTH_COLORS.text, height: '100%' },
  error: { fontSize: 12, color: AUTH_COLORS.error },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  otpBox: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: { borderColor: AUTH_COLORS.blue, backgroundColor: '#F4F9FF' },
  otpDigit: { fontSize: 22, fontWeight: '800', color: AUTH_COLORS.navy },
  otpHidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.02 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F8',
    borderRadius: 14,
    padding: 4,
  },
  segmentItem: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentItemOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '700', color: AUTH_COLORS.muted },
  segmentTextOn: { color: AUTH_COLORS.navy },
  button: {
    height: 54,
    borderRadius: 16,
    backgroundColor: AUTH_COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: AUTH_COLORS.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonDisabled: { backgroundColor: '#A9B4CC' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  link: { color: AUTH_COLORS.blue, fontSize: 14, fontWeight: '700' },
  devButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  devButtonPressed: {
    backgroundColor: '#EEF2F6',
    borderColor: '#94A3B8',
  },
  devButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
