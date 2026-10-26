import { Image } from 'expo-image';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextInput as RNTextInput,
  type TextInputProps,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';
import { AppIcon } from '@/components/app-icon';
import { AUTH_COLORS } from '@/components/auth/auth-colors';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export { AUTH_COLORS };

/** System popup so auth failures are never buried below the fold. */
export function showAuthAlert(title: string, message: string) {
  Alert.alert(title, message);
}

/** True while the soft keyboard is up, so screens can give the form the room. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setOpen(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

export function AuthScreen({
  title,
  subtitle,
  progress,
  children,
}: {
  title: string;
  subtitle: string;
  /** Multi-step flows show "Step n of total" above the form. */
  progress?: { step: number; total: number };
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  return (
    <FormScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        layout={HERO_LAYOUT}
        style={[
          styles.hero,
          keyboardOpen && styles.heroCompact,
          { paddingTop: insets.top + (keyboardOpen ? 10 : 16) },
        ]}
      >
        <View style={styles.blobLarge} />
        <View style={styles.blobMid} />
        <View style={styles.blobSmall} />
        {keyboardOpen ? null : (
          <Animated.View
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(100)}
            style={styles.heroBrand}
          >
            <View style={styles.logoTile}>
              <Image
                source={require('../../../assets/images/logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
            </View>
            <Text style={styles.brand}>Seznik</Text>
          </Animated.View>
        )}
        <Animated.Text
          key={title}
          entering={FadeIn.duration(260)}
          style={[styles.title, keyboardOpen && styles.titleCompact]}
        >
          {title}
        </Animated.Text>
        {keyboardOpen ? null : (
          <Animated.Text
            key={subtitle}
            entering={FadeIn.duration(260)}
            exiting={FadeOut.duration(100)}
            style={styles.subtitle}
          >
            {subtitle}
          </Animated.Text>
        )}
      </Animated.View>
      <Animated.View
        layout={HERO_LAYOUT}
        style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}
      >
        <View style={styles.sheetHandle} />
        {progress ? <StepProgress step={progress.step} total={progress.total} /> : null}
        <View style={styles.form}>{children}</View>
      </Animated.View>
    </FormScrollView>
  );
}

/** Hero and sheet glide when the keyboard opens or the step changes. */
const HERO_LAYOUT = LinearTransition.duration(240);

function ProgressBar({ on }: { on: boolean }) {
  const fill = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    fill.value = withTiming(on ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [on, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.progressBar}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`Step ${step} of ${total}`}>
      <View style={styles.progressBars}>
        {Array.from({ length: total }, (_, i) => (
          <ProgressBar key={i} on={i < step} />
        ))}
      </View>
      <Text style={styles.progressText}>
        Step {step} of {total}
      </Text>
    </View>
  );
}

/** Inline failure message that replaces the popup, so the form stays in view. */
export function AuthBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOut.duration(120)}
      style={styles.banner}
      accessibilityRole="alert"
    >
      <Text style={styles.bannerText}>{message}</Text>
    </Animated.View>
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
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        {icon ? (
          <AppIcon
            name={icon}
            size={18}
            tintColor={focused ? AUTH_COLORS.accent : '#6B6B73'}
            style={styles.fieldIcon}
          />
        ) : null}
        {prefix ? (
          <Text style={styles.prefix} /* layout-ok: short country code beside the input */>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholderTextColor="#94A3B8"
          selectionColor={AUTH_COLORS.accent}
          cursorColor={AUTH_COLORS.accent}
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

/** Text control for Show/Hide and similar in-field actions. */
export function FieldToggle({
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
      hitSlop={10}
      style={({ pressed }) => [styles.fieldToggle, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.fieldToggleText, disabled && styles.fieldToggleOff]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Get OTP / Resend / Verified control that sits beside the phone number inside the field.
 */
export function OtpFieldAction({
  sent,
  verified,
  cooldown,
  busy,
  disabled,
  onPress,
}: {
  sent: boolean;
  verified?: boolean;
  cooldown: number;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  if (verified) {
    return (
      <View style={styles.otpChipVerified}>
        <AppIcon name="checkmark" size={12} tintColor="#FFFFFF" />
        <Text style={styles.otpChipVerifiedText}>Verified</Text>
      </View>
    );
  }

  const cooling = cooldown > 0;
  const off = disabled || busy || cooling;
  const label = busy ? '…' : cooling ? `${cooldown}s` : sent ? 'Resend' : 'Get OTP';

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Sending OTP' : cooling ? `Resend in ${cooldown}s` : label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.otpChip,
        sent && !cooling && !busy && styles.otpChipResend,
        off && styles.otpChipOff,
        pressed && !off && { opacity: 0.88 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={styles.otpChipText}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Six boxes over one hidden input. Autofills the SMS code and calls onComplete when full. */
export { OtpBoxes } from '@/components/auth/otp/otp-boxes';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        off && styles.buttonDisabled,
        pressed && !off && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
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
          style={[styles.segmentItem, o.value === value && styles.segmentItemOn]}
        >
          <Text style={[styles.segmentText, o.value === value && styles.segmentTextOn]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PasswordRules({ rules }: { rules: { id: string; label: string; met: boolean }[] }) {
  return (
    <View style={styles.rules}>
      {rules.map((rule) => (
        <View key={rule.id} style={[styles.ruleChip, rule.met && styles.ruleChipMet]}>
          <Text style={[styles.ruleChipText, rule.met && styles.ruleChipTextMet]}>
            {rule.met ? '✓ ' : ''}
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LinkText({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
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
  // Release builds never offer a login that skips the server.
  if (!__DEV__) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.devButton, pressed && styles.devButtonPressed]}
    >
      <Text style={styles.devButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_COLORS.bg },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: AUTH_COLORS.bg,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 30,
    overflow: 'hidden',
  },
  heroBrand: { alignItems: 'center' },
  heroCompact: { paddingBottom: 14 },
  blobLarge: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: AUTH_COLORS.accent,
    opacity: 0.2,
    top: -100,
    right: -80,
  },
  blobMid: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF8A4C',
    opacity: 0.14,
    top: 40,
    left: -30,
  },
  blobSmall: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: AUTH_COLORS.accent,
    opacity: 0.1,
    bottom: -50,
    left: -50,
  },
  logoTile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  logo: { width: 50, height: 50 },
  brand: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#FF8A4C',
    textTransform: 'uppercase',
  },
  titleCompact: { fontSize: 22, marginTop: 0 },
  progress: { gap: 8, marginBottom: 18 },
  progressBars: { flexDirection: 'row', gap: 6 },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A2A2E',
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: AUTH_COLORS.accent },
  progressText: { fontSize: 12, fontWeight: '700', color: AUTH_COLORS.muted },
  banner: {
    backgroundColor: '#2A1717',
    borderWidth: 1,
    borderColor: '#5B2323',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerText: { fontSize: 13, color: AUTH_COLORS.error, lineHeight: 18 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#A1A1AA',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 21,
    maxWidth: 280,
  },
  sheet: {
    flexGrow: 1,
    backgroundColor: AUTH_COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#35353A',
    marginBottom: 18,
  },
  form: { gap: 16 },
  fieldWrap: { gap: 8 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E4E4E7',
    letterSpacing: 0.2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH_COLORS.field,
    borderWidth: 1.5,
    borderColor: AUTH_COLORS.border,
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 8,
    minHeight: 56,
  },
  fieldFocused: {
    borderColor: AUTH_COLORS.accent,
    backgroundColor: AUTH_COLORS.fieldFocus,
  },
  fieldError: { borderColor: AUTH_COLORS.error },
  fieldIcon: { marginRight: 8 },
  prefix: {
    fontSize: 15,
    color: AUTH_COLORS.text,
    fontWeight: '700',
    marginRight: 8,
    paddingRight: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: AUTH_COLORS.border,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: AUTH_COLORS.text,
    height: '100%',
    paddingVertical: 14,
    minWidth: 0,
  },
  fieldToggle: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  fieldToggleText: {
    color: AUTH_COLORS.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  fieldToggleOff: { color: '#55555C' },
  error: { fontSize: 12, color: AUTH_COLORS.error },
  otpChip: {
    minWidth: 84,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: AUTH_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  otpChipResend: {
    backgroundColor: '#3A3A40',
  },
  otpChipOff: {
    backgroundColor: '#2E2E33',
  },
  otpChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  otpChipVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: AUTH_COLORS.success,
    marginLeft: 6,
  },
  otpChipVerifiedText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#232326',
    borderRadius: 14,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemOn: {
    backgroundColor: '#35353A',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '700', color: AUTH_COLORS.muted },
  segmentTextOn: { color: AUTH_COLORS.text },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  ruleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#232326',
    borderWidth: 1,
    borderColor: '#35353A',
  },
  ruleChipMet: {
    backgroundColor: '#12281F',
    borderColor: '#1F5C41',
  },
  ruleChipText: { fontSize: 11, fontWeight: '600', color: AUTH_COLORS.muted },
  ruleChipTextMet: { color: '#6EE7B7' },
  button: {
    height: 54,
    borderRadius: 16,
    backgroundColor: AUTH_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: AUTH_COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonDisabled: {
    backgroundColor: '#2E2E33',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  link: { color: AUTH_COLORS.accent, fontSize: 14, fontWeight: '700' },
  devButton: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#3F3F45',
    borderStyle: 'dashed',
    backgroundColor: AUTH_COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  devButtonPressed: {
    backgroundColor: '#2A2A2E',
    borderColor: '#6B6B73',
  },
  devButtonText: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
