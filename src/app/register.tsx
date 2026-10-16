import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AUTH_COLORS,
  AuthField,
  AuthScreen,
  PrimaryButton,
} from '@/components/auth/auth-ui';
import {
  DEMO_OTP,
  OTP_LENGTH,
  digitsOnly,
  isStrongPassword,
  isValidName,
  isValidPhone,
  passwordRuleResults,
} from '@/lib/auth/validation';
import { useAuthStore } from '@/stores/auth-store';
import { LightScope } from '@/theme';

function RegisterScreenContent() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneValid = isValidPhone(phone);
  const rules = passwordRuleResults(password);
  const passwordOk = isStrongPassword(password);
  const confirmMismatch = confirm.length > 0 && confirm !== password;
  const canCreate =
    isValidName(name) && phoneValid && verified && passwordOk && confirm === password;

  const changePhone = (value: string) => {
    setPhone(digitsOnly(value));
    // A new number needs a fresh OTP.
    setOtpSent(false);
    setOtp('');
    setOtpError(null);
    setVerified(false);
    setError(null);
  };

  const sendOtp = () => {
    setOtpSent(true);
    setOtp(DEMO_OTP); // Auto-filled until a real SMS provider exists.
    setOtpError(null);
    setVerified(false);
  };

  const verifyOtp = () => {
    if (otp === DEMO_OTP) {
      setVerified(true);
      setOtpError(null);
    } else {
      setOtpError('Incorrect OTP. Please try again.');
    }
  };

  const submit = () => {
    const result = register({ name: name.trim(), phone, password });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/');
  };

  return (
    <AuthScreen title="Create account" subtitle="Register to start printing with Seznik">
      <AuthField
        label="Full name"
        placeholder="Your name"
        autoCapitalize="words"
        value={name}
        onChangeText={setName}
      />

      <AuthField
        label="Phone number"
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
            <Pressable onPress={sendOtp} disabled={!phoneValid} hitSlop={8}>
              <Text style={[styles.otpAction, !phoneValid && styles.otpActionOff]}>
                {otpSent ? 'Resend' : 'Get OTP'}
              </Text>
            </Pressable>
          )
        }
      />

      {otpSent && !verified ? (
        <View style={styles.otpBlock}>
          <AuthField
            label="Enter OTP"
            placeholder="----"
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            value={otp}
            onChangeText={(v) => {
              setOtp(digitsOnly(v, OTP_LENGTH));
              setOtpError(null);
            }}
            error={otpError}
          />
          <PrimaryButton label="Verify OTP" onPress={verifyOtp} disabled={otp.length !== OTP_LENGTH} />
        </View>
      ) : null}

      <AuthField
        label="Password"
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
        placeholder="Re-enter your password"
        secureTextEntry={!showPassword}
        value={confirm}
        onChangeText={setConfirm}
        error={confirmMismatch ? 'Passwords do not match' : null}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Create account" onPress={submit} disabled={!canCreate} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/login" replace style={styles.footerLink}>
          Log in
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  otpAction: { color: AUTH_COLORS.blue, fontWeight: '700', fontSize: 13 },
  otpActionOff: { color: '#A9B4CC' },
  verified: { color: AUTH_COLORS.success, fontWeight: '700', fontSize: 13 },
  otpBlock: { gap: 12 },
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
