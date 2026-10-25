import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  AUTH_COLORS,
  AuthField,
  AuthScreen,
  DevBypassButton,
  FieldToggle,
  OtpBoxes,
  OtpFieldAction,
  PrimaryButton,
  Segmented,
  showAuthAlert,
} from '@/components/auth/auth-ui';
import { useOtp } from '@/lib/auth/use-otp';
import { usePhoneHint } from '@/lib/auth/use-phone-hint';
import { OTP_LENGTH, digitsOnly, isValidPhone } from '@/lib/auth/validation';
import { useAuthStore } from '@/stores/auth-store';
import { LightScope } from '@/theme';

type LoginMode = 'password' | 'otp';

function LoginScreenContent() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const bypassAuth = useAuthStore((s) => s.bypassAuth);
  const otpFlow = useOtp('login', (code) => {
    setOtp(code);
    void verifyOtp(code);
  });
  const [mode, setMode] = useState<LoginMode>('password');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);

  const phoneValid = isValidPhone(phone);
  const canSubmit = phoneValid && password.length > 0;
  const otpSendOff = !phoneValid;

  useEffect(() => {
    if (!otpFlow.error) return;
    showAuthAlert('OTP', otpFlow.error);
    setOtpInvalid(true);
    otpFlow.setError(null);
  }, [otpFlow.error, otpFlow.setError]);

  const finish = (result: Awaited<ReturnType<typeof login>>) => {
    if (!result.ok) {
      showAuthAlert('Login failed', result.error);
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
    setSubmitting(true);
    finish(await login(phone, { password }));
    setSubmitting(false);
  };

  const verifyOtp = async (code: string) => {
    const proof = await otpFlow.verify(phone, code);
    if (!proof) {
      setOtp('');
      return;
    }
    setSubmitting(true);
    finish(await login(phone, { otpProof: proof }));
    setSubmitting(false);
  };

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setOtp('');
    setOtpInvalid(false);
    otpFlow.reset();
  };

  const sendOtp = () => {
    setOtp('');
    setOtpInvalid(false);
    void otpFlow.send(phone);
  };

  const handleDevBypass = () => {
    bypassAuth();
    router.replace('/');
  };

  return (
    <AuthScreen title="Welcome back" subtitle="Log in to continue printing with Seznik">
      <Segmented
        value={mode}
        onChange={switchMode}
        options={[
          { value: 'password', label: 'Password' },
          { value: 'otp', label: 'OTP' },
        ]}
      />
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
      ) : otpFlow.sent ? (
        <OtpBoxes
          length={OTP_LENGTH}
          value={otp}
          onChange={(v) => {
            setOtp(v);
            setOtpInvalid(false);
            otpFlow.setError(null);
          }}
          onComplete={verifyOtp}
          invalid={otpInvalid}
          autoFocus
          hint={`Code sent to +91 ${phone}`}
        />
      ) : (
        <Text style={styles.hint}>Enter your number, then tap Get OTP</Text>
      )}

      {mode === 'password' ? (
        <PrimaryButton
          label="Log in"
          onPress={submit}
          disabled={!canSubmit}
          loading={submitting}
        />
      ) : submitting ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={AUTH_COLORS.navy} />
          <Text style={styles.hint}>Logging in…</Text>
        </View>
      ) : null}

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

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: AUTH_COLORS.muted, textAlign: 'center', lineHeight: 18 },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' },
  footerText: { color: AUTH_COLORS.muted, fontSize: 14 },
  footerLink: { color: AUTH_COLORS.blue, fontSize: 14, fontWeight: '700' },
});

/** Switched off for now (D8, backlog): stays light in dark mode until converted. */
export default function LoginScreen() {
  return (
    <LightScope>
      <LoginScreenContent />
    </LightScope>
  );
}
