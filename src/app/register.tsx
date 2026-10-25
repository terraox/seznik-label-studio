import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AUTH_COLORS,
  AuthField,
  AuthScreen,
  DevBypassButton,
  FieldToggle,
  OtpBoxes,
  OtpFieldAction,
  PasswordRules,
  PrimaryButton,
  showAuthAlert,
} from '@/components/auth/auth-ui';
import { usePhoneHint } from '@/lib/auth/use-phone-hint';
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
  const [submitting, setSubmitting] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);

  const verified = otpProof !== null;
  const phoneValid = isValidPhone(phone);
  const rules = passwordRuleResults(password);
  const passwordOk = isStrongPassword(password);
  const confirmMismatch = confirm.length > 0 && confirm !== password;
  const canCreate = isValidName(name) && phoneValid && verified && passwordOk && confirm === password;
  const otpSendOff = !phoneValid;

  useEffect(() => {
    if (!otpFlow.error) return;
    showAuthAlert('OTP', otpFlow.error);
    setOtpInvalid(true);
    otpFlow.setError(null);
  }, [otpFlow.error, otpFlow.setError]);

  const changePhone = (value: string) => {
    setPhone(digitsOnly(value));
    // A new number needs a fresh OTP.
    setOtp('');
    setOtpProof(null);
    setOtpInvalid(false);
    otpFlow.reset();
  };

  const onPhoneFocus = usePhoneHint(phone, changePhone);

  const sendOtp = async () => {
    setOtp('');
    setOtpProof(null);
    setOtpInvalid(false);
    await otpFlow.send(phone);
  };

  const verifyOtp = async (code: string) => {
    const proof = await otpFlow.verify(phone, code);
    if (proof) {
      setOtpProof(proof);
      setOtpInvalid(false);
    } else {
      setOtp('');
    }
  };

  const submit = async () => {
    if (!otpProof) return;
    setSubmitting(true);
    const result = await register({ name: name.trim(), phone, password, otpProof });
    setSubmitting(false);
    if (!result.ok) {
      showAuthAlert('Could not create account', result.error);
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
        placeholder="10-digit mobile"
        keyboardType="number-pad"
        maxLength={10}
        value={phone}
        onChangeText={changePhone}
        onFocus={onPhoneFocus}
        error={phone.length === 10 && !phoneValid ? 'Enter a valid mobile number' : null}
        right={
          <OtpFieldAction
            sent={otpFlow.sent}
            verified={verified}
            cooldown={otpFlow.cooldown}
            busy={otpFlow.busy}
            disabled={otpSendOff}
            onPress={sendOtp}
          />
        }
      />

      {otpFlow.sent && !verified ? (
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
      ) : null}

      <AuthField
        label="Password"
        icon="lock"
        placeholder="Create a password"
        secureTextEntry={!showPassword}
        value={password}
        onChangeText={setPassword}
        right={
          <FieldToggle
            label={showPassword ? 'Hide' : 'Show'}
            onPress={() => setShowPassword((s) => !s)}
          />
        }
      />

      <PasswordRules rules={rules} />

      <AuthField
        label="Confirm password"
        icon="lock"
        placeholder="Re-enter your password"
        secureTextEntry={!showPassword}
        value={confirm}
        onChangeText={setConfirm}
        error={confirmMismatch ? 'Passwords do not match' : null}
      />

      <PrimaryButton
        label="Create account"
        onPress={submit}
        disabled={!canCreate}
        loading={submitting}
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' },
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
