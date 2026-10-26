import { Link, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
  useAuthColors,
  authPalette,
  AuthBanner,
  AuthField,
  AuthScreen,
  DevBypassButton,
  FieldToggle,
  OtpBoxes,
  LinkText,
  OtpFieldAction,
  PrimaryButton,
} from '@/components/auth/auth-ui';
import { useOtp } from '@/lib/auth/use-otp';
import { usePhoneHint } from '@/lib/auth/use-phone-hint';
import { OTP_LENGTH, digitsOnly, isValidPhone } from '@/lib/auth/validation';
import { goBack } from '@/lib/go-back';
import { useAuthStore } from '@/stores/auth-store';
import { makeStyles } from '@/theme';

type LoginMode = 'password' | 'otp';

export default function LoginScreen() {
  const styles = useStyles();
  const A = useAuthColors();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const beginLogin = useAuthStore((s) => s.beginLogin);
  const bypassAuth = useAuthStore((s) => s.bypassAuth);
  const otpFlow = useOtp('login', (code) => {
    setOtp(code);
    void verifyOtp(code);
  });
  const [mode, setMode] = useState<LoginMode>('otp');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const pendingSignIn = useRef<ReturnType<typeof beginLogin> | null>(null);

  const phoneValid = isValidPhone(phone);
  const canSubmit = phoneValid && password.length > 0;
  const otpSendOff = !phoneValid;

  useEffect(() => {
    if (!otpFlow.error) return;
    setFormError(otpFlow.error);
    setOtpInvalid(true);
    otpFlow.setError(null);
  }, [otpFlow.error, otpFlow.setError]);

  const finish = (result: Awaited<ReturnType<typeof login>>) => {
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.replace(result.needsPrinter ? '/select-printer' : '/');
  };

  const onPhoneFocus = usePhoneHint(phone, (picked) => {
    setPhone(picked);
    setOtp('');
    setOtpInvalid(false);
    otpFlow.reset();
  });

  const submit = async () => {
    setFormError(null);
    setSubmitting(true);
    finish(await login(phone, { password }));
    setSubmitting(false);
  };

  const verifyOtp = async (code: string) => {
    setChecking(true);
    const proof = await otpFlow.verify(phone, code);
    setChecking(false);
    if (!proof) {
      setOtp('');
      return;
    }
    setFormError(null);
    // The request runs while the verified animation plays. The session only opens (which swaps
    // the navigator) once the animation ends, so it is never cut short.
    const signIn = beginLogin(phone, { otpProof: proof });
    pendingSignIn.current = signIn;
    setOtpVerified(true);
    const early = await signIn;
    if (!early.ok && pendingSignIn.current === signIn) {
      pendingSignIn.current = null;
      setOtpVerified(false);
      setOtp('');
      otpFlow.reset();
      setFormError(early.error);
    }
  };

  const onVerifiedDone = async () => {
    const signIn = pendingSignIn.current;
    if (!signIn) return;
    pendingSignIn.current = null;
    const result = await signIn;
    if (!result.ok) {
      setOtpVerified(false);
      setOtp('');
      otpFlow.reset();
      setFormError(result.error);
      return;
    }
    result.commit();
    router.replace(result.needsPrinter ? '/select-printer' : '/');
  };

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setOtpVerified(false);
    setFormError(null);
    setOtp('');
    setOtpInvalid(false);
    otpFlow.reset();
  };

  const sendOtp = () => {
    setFormError(null);
    setOtp('');
    setOtpInvalid(false);
    void otpFlow.send(phone);
  };

  const handleDevBypass = () => {
    bypassAuth();
    router.replace('/');
  };

  return (
    <AuthScreen onBack={() => goBack('/welcome')} title="Welcome back" subtitle="Log in to continue printing with Seznik">
      <AuthField
        label="Phone number"
        icon="phone.fill"
        prefix="+91"
        placeholder="10-digit mobile"
        keyboardType="number-pad"
        maxLength={10}
        value={phone}
        onFocus={onPhoneFocus}
        onChangeText={(v) => {
          setPhone(digitsOnly(v));
          setFormError(null);
          setOtp('');
          setOtpInvalid(false);
          otpFlow.reset();
        }}
        right={
          mode === 'otp' ? (
            <OtpFieldAction
              sent={otpFlow.sent}
              cooldown={otpFlow.cooldown}
              busy={otpFlow.busy}
              disabled={otpSendOff}
              onPress={sendOtp}
            />
          ) : undefined
        }
      />

      {mode === 'password' ? (
        <Animated.View key="pw" entering={FadeIn.duration(220)}>
          <AuthField
            label="Password"
            icon="lock"
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={canSubmit ? submit : undefined}
            right={
              <FieldToggle
                label={showPassword ? 'Hide' : 'Show'}
                onPress={() => setShowPassword((s) => !s)}
              />
            }
          />
        </Animated.View>
      ) : otpFlow.sent ? (
        <OtpBoxes
          length={OTP_LENGTH}
          value={otp}
          onChange={(v) => {
            setFormError(null);
            setOtp(v);
            setOtpInvalid(false);
            otpFlow.setError(null);
          }}
          onComplete={verifyOtp}
          invalid={otpInvalid}
          verifying={checking}
          success={otpVerified}
          onSuccessDone={onVerifiedDone}
          autoFocus
          hint={`Code sent to +91 ${phone}`}
        />
      ) : (
        <Animated.Text key="otp-hint" entering={FadeIn.duration(220)} style={styles.hint}>
          Enter your number, then tap Get OTP
        </Animated.Text>
      )}

      <AuthBanner message={formError} />

      {mode === 'password' ? (
        <PrimaryButton label="Log in" onPress={submit} disabled={!canSubmit} loading={submitting} />
      ) : submitting ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={A.accent} />
          <Text style={styles.hint}>Logging in…</Text>
        </View>
      ) : null}

      <View style={styles.switchRow}>
        <LinkText
          label={mode === 'otp' ? 'Use password instead' : 'Use OTP instead'}
          onPress={() => switchMode(mode === 'otp' ? 'password' : 'otp')}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>New to Seznik? </Text>
        <Link href="/register" replace style={styles.footerLink}>
          Create account
        </Link>
      </View>
      <DevBypassButton onPress={handleDevBypass} />
    </AuthScreen>
  );
}

const useStyles = makeStyles((_c, scheme) => {
  const A = authPalette(scheme);
  return {
    hint: { fontSize: 13, color: A.muted, textAlign: 'center', lineHeight: 18 },
    busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    switchRow: { alignItems: 'center' },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' },
    footerText: { color: A.muted, fontSize: 14 },
    footerLink: { color: A.link, fontSize: 14, fontWeight: '700' },
  } as const;
});
