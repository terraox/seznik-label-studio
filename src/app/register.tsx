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
} from '@/components/auth/auth-ui';
import {
  OTP_LENGTH,
  digitsOnly,
  isStrongPassword,
  isValidName,
  isValidPhone,
  passwordRuleResults,
} from '@/lib/auth/validation';
import { useOtp } from '@/lib/auth/use-otp';
import { useAuthStore } from '@/stores/auth-store';
import { LightScope } from '@/theme';

function RegisterScreenContent() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const bypassAuth = useAuthStore((s) => s.bypassAuth);
  const otpFlow = useOtp('register', (code) => {
    setOtp(code);
    void verifyOtp(code);
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpProof, setOtpProof] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const verified = otpProof !== null;
  const phoneValid = isValidPhone(phone);
  const rules = passwordRuleResults(password);
  const passwordOk = isStrongPassword(password);
  const confirmMismatch = confirm.length > 0 && confirm !== password;
  const canCreate = isValidName(name) && phoneValid && verified && passwordOk && confirm === password;
  const resendOff = !phoneValid || otpFlow.busy || otpFlow.cooldown > 0;

  const changePhone = (value: string) => {
    setPhone(digitsOnly(value));
    // A new number needs a fresh OTP.
    setOtp('');
    setOtpProof(null);
    otpFlow.reset();
    setError(null);
  };

  const sendOtp = async () => {
    setError(null);
    setOtp('');
    setOtpProof(null);
    await otpFlow.send(phone);
  };

  const verifyOtp = async (code: string) => {
    const proof = await otpFlow.verify(phone, code);
    if (proof) setOtpProof(proof);
    else setOtp('');
  };

  const submit = async () => {
    if (!otpProof) return;
    setSubmitting(true);
    setError(null);
    const result = await register({ name: name.trim(), phone, password, otpProof });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(result.needsPrinter ? '/select-printer' : '/');
  };

  const handleDevBypass = () => {
    bypassAuth();
    router.replace('/');
  };

  return (
    <AuthScreen title="Create account" subtitle="Register to start printing with Seznik">
      <AuthField
        label="Full name"
        icon="person"
        placeholder="Your name"
        autoCapitalize="words"
        value={name}
        onChangeText={setName}
      />

      <AuthField
        label="Phone number"
        icon="phone.fill"
        prefix="+91"
        placeholder="10-digit mobile number"
        keyboardType="number-pad"
        maxLength={10}
        value={phone}
        onChangeText={changePhone}
        error={phone.length === 10 && !phoneValid ? 'Enter a valid mobile number' : null}
        right={
          verified ? (
            <Text style={styles.verified}>Verified ✓</Text>
          ) : (
            <Pressable onPress={sendOtp} disabled={resendOff} hitSlop={8}>
              <Text style={[styles.otpAction, resendOff && styles.otpActionOff]}>
                {otpFlow.cooldown > 0
                  ? `Resend in ${otpFlow.cooldown}s`
                  : otpFlow.sent
                    ? 'Resend'
                    : 'Get OTP'}
              </Text>
            </Pressable>
          )
        }
      />

      {otpFlow.sent && !verified ? (
        <View style={styles.otpBlock}>
          <Text style={styles.otpHint}>Enter the 6-digit code sent to +91 {phone}</Text>
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

      <AuthField
        label="Password"
        icon="lock"
        placeholder="Create a password"
        secureTextEntry={!showPassword}
        value={password}
        onChangeText={setPassword}
        right={
          <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
            <Text style={styles.otpAction}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        }
      />

      <View style={styles.rules}>
        {rules.map((rule) => (
          <View key={rule.id} style={styles.rule}>
            <Text style={[styles.ruleMark, rule.met && styles.ruleMet]}>{rule.met ? '✓' : '○'}</Text>
            <Text style={[styles.ruleText, rule.met && styles.ruleMet]}>{rule.label}</Text>
          </View>
        ))}
      </View>

      <AuthField
        label="Confirm password"
        icon="lock"
        placeholder="Re-enter your password"
        secureTextEntry={!showPassword}
        value={confirm}
        onChangeText={setConfirm}
        error={confirmMismatch ? 'Passwords do not match' : null}
      />

      {otpFlow.error && !otpFlow.sent ? <Text style={styles.error}>{otpFlow.error}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={submitting ? 'Creating…' : 'Create account'}
        onPress={submit}
        disabled={!canCreate || submitting}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/login" replace style={styles.footerLink}>
          Log in
        </Link>
      </View>
      <DevBypassButton onPress={handleDevBypass} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  otpAction: { color: AUTH_COLORS.blue, fontWeight: '700', fontSize: 13 },
  otpActionOff: { color: '#A9B4CC' },
  verified: { color: AUTH_COLORS.success, fontWeight: '700', fontSize: 13 },
  otpBlock: { gap: 10 },
  otpHint: { fontSize: 13, color: AUTH_COLORS.muted },
  rules: { gap: 6, marginTop: -4 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleMark: { width: 16, fontSize: 13, color: AUTH_COLORS.muted },
  ruleText: { fontSize: 13, color: AUTH_COLORS.muted },
  ruleMet: { color: AUTH_COLORS.success },
  error: { color: AUTH_COLORS.error, fontSize: 13, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerText: { color: AUTH_COLORS.muted, fontSize: 14 },
  footerLink: { color: AUTH_COLORS.blue, fontSize: 14, fontWeight: '700' },
});

/** Switched off for now (D8, backlog): stays light in dark mode until converted. */
export default function RegisterScreen() {
  return (
    <LightScope>
      <RegisterScreenContent />
    </LightScope>
  );
}
