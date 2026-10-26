import { Image } from 'expo-image';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
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
import { authPalette, useAuthColors } from '@/components/auth/auth-colors';
import { GridBackground } from '@/components/grid-background';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '@/theme';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export { authPalette, useAuthColors };

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

/** Faint square grid across the whole screen, fading out toward the edges (as on the admin login). */
function AuthGrid() {
  const A = useAuthColors();
  return <GridBackground color={A.grid} />;
}

/** Left-to-right (or top-to-bottom) colour fill behind a control. */
function GradientFill({ from, to, vertical }: { from: string; to: string; vertical?: boolean }) {
  const id = useId();
  return (
    <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function AuthScreen({
  title,
  subtitle,
  progress,
  footer,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  /** Multi-step flows show "Step n of total" above the form. */
  progress?: { step: number; total: number; label?: string };
  /** Pinned under the scrolling form, always in reach (a main action). */
  footer?: ReactNode;
  /** Shows a back button top-left. */
  onBack?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const styles = useStyles();
  const A = useAuthColors();
  return (
    <View style={styles.root}>
      <AuthGrid />
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.backButton, { top: insets.top + 8 }]}
        >
          <AppIcon name="chevron.left" size={18} tintColor={A.text} />
        </Pressable>
      ) : null}
      <FormScrollView
        style={styles.scrollView}
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
          {keyboardOpen ? null : (
            <Animated.View
              entering={FadeIn.duration(220)}
              exiting={FadeOut.duration(100)}
              style={styles.heroBrand}
            >
              <View style={styles.logoHalo}>
                <View style={styles.logoTile}>
                  <Image
                    source={require('../../../assets/images/logo-intro.png')}
                    style={styles.logo}
                    contentFit="contain"
                  />
                </View>
              </View>
              <Text style={styles.brand}>Seznik</Text>
              <View style={styles.brandRule} />
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
          style={[styles.sheet, { marginBottom: footer ? 16 : insets.bottom + 24 }]}
        >
          {progress ? (
            <StepProgress step={progress.step} total={progress.total} label={progress.label} />
          ) : null}
          <View style={styles.form}>{children}</View>
        </Animated.View>
      </FormScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>{footer}</View>
      ) : null}
    </View>
  );
}

/** Hero and sheet glide when the keyboard opens or the step changes. */
const HERO_LAYOUT = LinearTransition.duration(240);

function ProgressBar({ on }: { on: boolean }) {
  const styles = useStyles();
  const fill = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    fill.value = withTiming(on ? 1 : 0, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [on, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={styles.progressBar}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

function StepProgress({ step, total, label }: { step: number; total: number; label?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.progress} accessibilityLabel={`Step ${step} of ${total}`}>
      <View style={styles.progressBars}>
        {Array.from({ length: total }, (_, i) => (
          <ProgressBar key={i} on={i < step} />
        ))}
      </View>
      <Text style={styles.progressText}>
        Step {step} of {total}
        {label ? `  ·  ${label}` : ''}
      </Text>
    </View>
  );
}

/** Inline failure message that replaces the popup, so the form stays in view. */
export function AuthBanner({ message }: { message: string | null }) {
  const styles = useStyles();
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
  const styles = useStyles();
  const A = useAuthColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        {icon ? (
          <AppIcon
            name={icon}
            size={18}
            tintColor={focused ? A.accent : A.icon}
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
          placeholderTextColor={A.placeholder}
          selectionColor={A.accent}
          cursorColor={A.accent}
          selectTextOnFocus={false}
          // Android draws its own line under a text field; the card already has a border.
          underlineColorAndroid="transparent"
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
  const styles = useStyles();
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
  const styles = useStyles();
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

/**
 * Phone number card: country pill, big digits, and a full-width OTP button underneath
 * (Get OTP, then Resend with a countdown, then Verified).
 */
export function PhoneCard({
  label = 'Mobile number',
  error,
  onFocus,
  onBlur,
  sent,
  verified,
  cooldown,
  busy,
  disabled,
  onSendOtp,
  hideAction,
  ...input
}: TextInputProps & {
  label?: string;
  error?: string | null;
  sent: boolean;
  verified?: boolean;
  cooldown: number;
  busy?: boolean;
  /** Greys the OTP button (number not valid yet). */
  disabled?: boolean;
  onSendOtp: () => void;
  hideAction?: boolean;
}) {
  const styles = useStyles();
  const A = useAuthColors();
  const [focused, setFocused] = useState(false);
  const cooling = cooldown > 0;
  const off = Boolean(disabled || busy || cooling);
  const actionLabel = busy
    ? 'Sending…'
    : cooling
      ? `Resend in ${cooldown}s`
      : sent
        ? 'Resend OTP'
        : 'Get OTP';

  return (
    <View style={styles.phoneWrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.phoneBox,
          focused && styles.phoneBoxFocused,
          !!error && styles.fieldError,
          verified && styles.phoneBoxVerified,
        ]}
      >
        <View style={styles.countryCell}>
          <Text style={styles.countryCode}>+91</Text>
        </View>
        <TextInput
          style={styles.phoneInput}
          placeholder="Enter mobile number"
          placeholderTextColor={A.placeholder}
          selectionColor={A.accent}
          cursorColor={A.accent}
          keyboardType="number-pad"
          maxLength={10}
          underlineColorAndroid="transparent"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          editable={!verified}
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
        {verified ? (
          <View style={styles.phoneTick}>
            <AppIcon name="checkmark" size={14} tintColor="#FFFFFF" />
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hideAction ? null : verified ? (
        <View style={styles.otpBlockVerified}>
          <AppIcon name="checkmark" size={16} tintColor="#FFFFFF" />
          <Text style={styles.otpBlockText}>Number verified</Text>
        </View>
      ) : (
        <>
          <PrimaryButton
            label={actionLabel}
            onPress={onSendOtp}
            disabled={off && !busy}
            loading={busy}
          />
          {sent ? null : (
            <Text style={styles.phoneHelp}>
              We'll text you a 6-digit code to verify this number.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

/**
 * Replaces the phone card once a code is sent: six code boxes, who it went to, and resend.
 */
export function OtpCard({
  phone,
  cooldown,
  busy,
  onResend,
  onChangeNumber,
  children,
}: {
  phone: string;
  cooldown: number;
  busy?: boolean;
  onResend: () => void;
  onChangeNumber: () => void;
  /** The OtpBoxes row. */
  children: ReactNode;
}) {
  const styles = useStyles();
  const cooling = cooldown > 0;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={styles.otpCard}>
      <View style={styles.otpCardHead}>
        <Text style={styles.otpCardTitle}>Enter verification code</Text>
        <Text style={styles.otpCardSub}>We sent a 6-digit code to +91 {phone}</Text>
        <Pressable onPress={onChangeNumber} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>Change number</Text>
        </Pressable>
      </View>
      {children}
      <View style={styles.otpResendRow}>
        <Text style={styles.otpResendText}>Didn't get the code?</Text>
        <Pressable
          onPress={onResend}
          disabled={cooling || busy}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={[styles.link, (cooling || busy) && styles.otpResendOff]}>
            {busy ? 'Sending…' : cooling ? `Resend in ${cooldown}s` : 'Resend'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** Six boxes over one hidden input. Autofills the SMS code and calls onComplete when full. */
export { OtpBoxes } from '@/components/auth/otp/otp-boxes';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  arrow,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Shows a forward arrow after the label, for "go to the next step" buttons. */
  arrow?: boolean;
}) {
  const styles = useStyles();
  const A = useAuthColors();
  const off = disabled || loading;
  const press = useSharedValue(0);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.025 * press.value }] }));
  return (
    // The glow sits on this outer view; the button inside clips its own gradient.
    <Animated.View style={[styles.buttonWrap, !off && styles.buttonGlow, lift]}>
      <Pressable
        onPress={onPress}
        disabled={off}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 160 });
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!off, busy: !!loading }}
        style={[styles.button, off && styles.buttonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.buttonRow}>
            <Text style={styles.buttonLabel} numberOfLines={1}>
              {label}
            </Text>
            {arrow ? <AppIcon name="arrow.right" size={18} tintColor="#FFFFFF" /> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  const A = useAuthColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
      <Text style={[styles.link, disabled && { color: A.muted }]}>{label}</Text>
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
  const styles = useStyles();
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

const useStyles = makeStyles((_c, scheme) => {
  const A = authPalette(scheme);
  return {
    root: { flex: 1, backgroundColor: A.bg },
    backButton: {
      position: 'absolute',
      left: 16,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: A.field,
      borderWidth: 1,
      borderColor: A.border,
    },
    scrollView: { flex: 1, backgroundColor: 'transparent' },
    scroll: { flexGrow: 1 },
    hero: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 22,
    },
    heroBrand: { alignItems: 'center' },
    heroCompact: { paddingBottom: 12 },
    logoHalo: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
    logoTile: {
      width: 88,
      height: 88,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: A.border,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: scheme === 'dark' ? 0.4 : 0.12,
      shadowRadius: 12,
      elevation: 6,
    },
    logo: { width: 86, height: 86, borderRadius: 21 },
    brand: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 6,
      color: A.link,
      textTransform: 'uppercase',
    },
    brandRule: {
      width: 36,
      height: 3,
      borderRadius: 2,
      backgroundColor: A.accent,
      marginTop: 10,
    },
    titleCompact: { fontSize: 22, marginTop: 0 },
    progress: { gap: 10, marginBottom: 20 },
    progressBars: { flexDirection: 'row', gap: 6 },
    progressBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: A.track,
      overflow: 'hidden',
    },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: A.accent },
    otpCard: {
      backgroundColor: A.field,
      borderWidth: 1.5,
      borderColor: A.border,
      borderRadius: 22,
      padding: 18,
      gap: 18,
    },
    otpCardHead: { alignItems: 'center', gap: 6 },
    otpCardTitle: { fontSize: 18, fontWeight: '800', color: A.text },
    otpCardSub: { fontSize: 13, color: A.muted, textAlign: 'center', lineHeight: 18 },
    otpResendRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    otpResendText: { fontSize: 13, color: A.muted, flexShrink: 1 },
    otpResendOff: { color: A.placeholder },
    phoneWrap: { gap: 10 },
    phoneBox: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 60,
      backgroundColor: A.field,
      borderWidth: 1.5,
      borderColor: A.border,
      borderRadius: 16,
      paddingRight: 14,
      overflow: 'hidden',
    },
    phoneBoxFocused: { borderColor: A.accent, backgroundColor: A.fieldFocus },
    phoneBoxVerified: { borderColor: A.success },
    countryCell: {
      height: '100%',
      paddingHorizontal: 16,
      justifyContent: 'center',
      backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
      borderRightWidth: 1,
      borderRightColor: A.border,
      marginRight: 14,
    },
    countryCode: { fontSize: 17, fontWeight: '700', color: A.text, letterSpacing: 0.3 },
    phoneInput: {
      flex: 1,
      minWidth: 0,
      height: '100%',
      fontSize: 18,
      fontWeight: '600',
      letterSpacing: 0.8,
      color: A.text,
      paddingVertical: 0,
    },
    phoneTick: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: A.success,
    },
    phoneHelp: { fontSize: 12, color: A.muted, textAlign: 'center', lineHeight: 17 },
    otpBlock: {
      height: 54,
      borderRadius: 16,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: A.accentDeep,
    },
    otpBlockOff: { backgroundColor: A.chipOff },
    otpBlockVerified: {
      height: 54,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: A.success,
    },
    otpBlockText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
    otpBlockTextOff: { color: scheme === 'dark' ? '#8A8A92' : '#FFFFFF' },
    progressText: { fontSize: 12, fontWeight: '700', color: A.muted },
    banner: {
      backgroundColor: A.bannerBg,
      borderWidth: 1,
      borderColor: A.bannerBorder,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    bannerText: { fontSize: 13, color: A.error, lineHeight: 18 },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: A.text,
      textAlign: 'center',
      marginTop: 16,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 15,
      color: A.subtitle,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 21,
      maxWidth: 280,
    },
    sheet: {
      backgroundColor: A.sheet,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: A.border,
      marginHorizontal: 16,
      paddingHorizontal: 20,
      paddingVertical: 22,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: scheme === 'dark' ? 0.5 : 0.08,
      shadowRadius: 20,
      elevation: 4,
    },
    form: { gap: 16 },
    footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: A.bg },
    fieldWrap: { gap: 8 },
    label: { fontSize: 13, fontWeight: '700', color: A.label, letterSpacing: 0.2 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: A.field,
      borderWidth: 1.5,
      borderColor: A.border,
      borderRadius: 16,
      paddingLeft: 14,
      paddingRight: 8,
      minHeight: 56,
    },
    fieldFocused: { borderColor: A.accent, backgroundColor: A.fieldFocus },
    fieldError: { borderColor: A.error },
    fieldIcon: { marginRight: 8 },
    prefix: {
      fontSize: 15,
      color: A.text,
      fontWeight: '700',
      marginRight: 8,
      paddingRight: 8,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: A.border,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: A.text,
      height: '100%',
      paddingVertical: 14,
      minWidth: 0,
    },
    fieldToggle: { paddingVertical: 10, paddingHorizontal: 10 },
    fieldToggleText: { color: A.link, fontWeight: '700', fontSize: 14 },
    fieldToggleOff: { color: A.placeholder },
    error: { fontSize: 12, color: A.error },
    otpChip: {
      minWidth: 84,
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: A.accentDeep,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 6,
    },
    otpChipResend: { backgroundColor: A.chipResend },
    otpChipOff: { backgroundColor: A.chipOff },
    otpChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
    otpChipVerified: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: A.success,
      marginLeft: 6,
    },
    otpChipVerifiedText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    segment: { flexDirection: 'row', backgroundColor: A.segment, borderRadius: 14, padding: 4 },
    segmentItem: {
      flex: 1,
      height: 42,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentItemOn: {
      backgroundColor: A.segmentOn,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    segmentText: { fontSize: 14, fontWeight: '700', color: A.muted },
    segmentTextOn: { color: A.text },
    rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
    ruleChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: A.ruleBg,
      borderWidth: 1,
      borderColor: A.ruleBorder,
    },
    ruleChipMet: { backgroundColor: A.ruleMetBg, borderColor: A.ruleMetBorder },
    ruleChipText: { fontSize: 11, fontWeight: '600', color: A.muted },
    ruleChipTextMet: { color: A.ruleMetText },
    buttonWrap: { marginTop: 4, borderRadius: 18 },
    buttonGlow: {
      shadowColor: A.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: scheme === 'dark' ? 0.22 : 0.18,
      shadowRadius: 10,
      elevation: 4,
    },
    button: {
      height: 58,
      borderRadius: 18,
      backgroundColor: A.accentDeep,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.22)', // theme-fixed: light edge on the gradient button
    },
    buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
    buttonLabel: {
      flexShrink: 1,
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    buttonDisabled: { backgroundColor: A.chipOff },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
    link: { color: A.link, fontSize: 14, fontWeight: '700' },
    devButton: {
      height: 46,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: A.devBorder,
      borderStyle: 'dashed',
      backgroundColor: A.field,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    devButtonPressed: { backgroundColor: A.track, borderColor: A.muted },
    devButtonText: { color: A.muted, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  } as const;
});
