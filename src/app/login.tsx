import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AUTH_COLORS,
  AuthField,
  AuthScreen,
  DevBypassButton,
  OtpBoxes,
  PrimaryButton,
  Segmented,
} from '@/components/auth/auth-ui';
import { useOtp } from '@/lib/auth/use-otp';
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneValid = isValidPhone(phone);
  const canSubmit = phoneValid && password.length > 0;
  const resendOff = !phoneValid || otpFlow.busy || otpFlow.cooldown > 0;

  const finish = (result: Awaited<ReturnType<typeof login>>) => {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(result.needsPrinter ? '/select-printer' : '/');
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
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
    setError(null);
    finish(await login(phone, { otpProof: proof }));
    setSubmitting(false);
  };

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError(null);
    setOtp('');
    otpFlow.reset();
  };

  const handleDevBypass = () => {
    bypassAuth();
    router.replace('/');
  };

  return (
    <AuthScreen title="Welcome back" subtitle="Log in to continue to Seznik">
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
        placeholder="10-digit mobile number"
        keyboardType="number-pad"
        maxLength={10}
        value={phone}
        onChangeText={(v) => {
          setPhone(digitsOnly(v));
          setError(null);
          setOtp('');
          otpFlow.reset();
        }}
        right={
          mode === 'otp' ? (
            <Pressable
              onPress={() => {
                setError(null);
                setOtp('');
                void otpFlow.send(phone);
              }}
              disabled={resendOff}
              hitSlop={8}>
              <Text style={[styles.toggle, resendOff && styles.toggleOff]}>
                {otpFlow.cooldown > 0
                  ? `Resend in ${otpFlow.cooldown}s`
                  : otpFlow.sent
                    ? 'Resend'
                    : 'Get OTP'}
              </Text>
            </Pressable>
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
          onChangeText={(v) => {
            setPassword(v);
            setError(null);
          }}
          onSubmitEditing={canSubmit ? submit : undefined}
          right={
            <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
              <Text style={styles.toggle}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          }
        />
      ) : otpFlow.sent ? (
        <View style={styles.otpBlock}>
          <Text style={styles.hint}>Enter the 6-digit code sent to +91 {phone}</Text>
          <OtpBoxes
            length={OTP_LENGTH}
            value={otp}
            onChange={(v) => {
              setOtp(v);
              otpFlow.setError(null);
            }}
            onComplete={verifyOtp}
            error={otpFlow.error}
            autoFocus
          />
        </View>
      ) : null}
      {mode === 'otp' && !otpFlow.sent && otpFlow.error ? (
        <Text style={styles.error}>{otpFlow.error}</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {mode === 'password' ? (
        <PrimaryButton
          label={submitting ? 'Logging in…' : 'Log in'}
          onPress={submit}
          disabled={!canSubmit || submitting}
        />
      ) : submitting ? (
        <Text style={styles.hint}>Logging in…</Text>
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
  toggle: { color: AUTH_COLORS.blue, fontWeight: '700', fontSize: 13 },
  toggleOff: { color: '#A9B4CC' },
  otpBlock: { gap: 10 },
  hint: { fontSize: 13, color: AUTH_COLORS.muted, textAlign: 'center' },
  error: { color: AUTH_COLORS.error, fontSize: 13, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
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
