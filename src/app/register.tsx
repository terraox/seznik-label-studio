import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  AUTH_COLORS,
  AuthBanner,
  AuthField,
  AuthScreen,
  DevBypassButton,
  FieldToggle,
  LinkText,
  OtpBoxes,
  OtpFieldAction,
  PasswordRules,
  PrimaryButton,
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
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [celebrating, setCelebrating] = useState(false);
  const [checking, setChecking] = useState(false);

  const verified = otpProof !== null;
  const phoneValid = isValidPhone(phone);
  const rules = passwordRuleResults(password);
  const passwordOk = isStrongPassword(password);
  const canCreate = isValidName(name) && phoneValid && verified && passwordOk;
  const otpSendOff = !phoneValid;

  useEffect(() => {
    if (!otpFlow.error) return;
    setFormError(otpFlow.error);
    setOtpInvalid(true);
    otpFlow.setError(null);
  }, [otpFlow.error, otpFlow.setError]);

  const changePhone = (value: string) => {
    setPhone(digitsOnly(value));
    setFormError(null);
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
    setChecking(true);
    const proof = await otpFlow.verify(phone, code);
    setChecking(false);
    if (proof) {
      setOtpProof(proof);
      setOtpInvalid(false);
      setFormError(null);
      setCelebrating(true);
    } else {
      setOtp('');
    }
  };

  const submit = async () => {
    if (!otpProof) return;
    setFormError(null);
    setSubmitting(true);
    const result = await register({ name: name.trim(), phone, password, otpProof });
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.replace(result.needsPrinter ? '/select-printer' : '/');
  };

  const handleDevBypass = () => {
    bypassAuth();
    router.replace('/');
  };

  return (
    <AuthScreen
      title={step === 1 ? 'Create account' : 'Almost there'}
      subtitle={
        step === 1 ? 'Verify your mobile number to get started' : 'Add your name and a password'
      }
      progress={{ step, total: 2 }}
    >
      {step === 1 ? (
        <Animated.View key="step1" entering={FadeInDown.duration(260)} style={styles.stepBody}>
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

          {otpFlow.sent && (!verified || celebrating) ? (
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
              success={verified}
              onSuccessDone={() => {
                setCelebrating(false);
                setStep(2);
              }}
              autoFocus
              hint={`Code sent to +91 ${phone}`}
            />
          ) : (
            <Text style={styles.hint}>Enter your number, then tap Get OTP</Text>
          )}

          <AuthBanner message={formError} />

          {verified ? <PrimaryButton label="Continue" onPress={() => setStep(2)} /> : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/login" replace style={styles.footerLink}>
              Log in
            </Link>
          </View>
          <DevBypassButton onPress={handleDevBypass} />
        </Animated.View>
      ) : (
        <Animated.View key="step2" entering={FadeInDown.duration(260)} style={styles.stepBody}>
          <Text style={styles.verifiedLine}>✓ +91 {phone} verified</Text>

          <AuthField
            label="Full name"
            icon="person"
            placeholder="Your name"
            autoCapitalize="words"
            value={name}
            onChangeText={(v) => {
              setFormError(null);
              setName(v);
            }}
          />

          <AuthField
            label="Password"
            icon="lock"
            placeholder="Create a password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={(v) => {
              setFormError(null);
              setPassword(v);
            }}
            onSubmitEditing={canCreate ? submit : undefined}
            right={
              <FieldToggle
                label={showPassword ? 'Hide' : 'Show'}
                onPress={() => setShowPassword((x) => !x)}
              />
            }
          />

          {password.length > 0 ? <PasswordRules rules={rules} /> : null}

          <AuthBanner message={formError} />

          <PrimaryButton
            label="Create account"
            onPress={submit}
            disabled={!canCreate}
            loading={submitting}
          />

          <View style={styles.switchRow}>
            <LinkText label="Change number" onPress={() => setStep(1)} disabled={submitting} />
          </View>
        </Animated.View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  stepBody: { gap: 16 },
  hint: { fontSize: 13, color: AUTH_COLORS.muted, textAlign: 'center', lineHeight: 18 },
  verifiedLine: { fontSize: 13, fontWeight: '700', color: AUTH_COLORS.success },
  switchRow: { alignItems: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' },
  footerText: { color: AUTH_COLORS.muted, fontSize: 14 },
  footerLink: { color: AUTH_COLORS.accent, fontSize: 14, fontWeight: '700' },
});

/** Switched off for now (D8, backlog): stays light in dark mode until converted. */
export default function RegisterScreen() {
  return (
    <LightScope>
      <RegisterScreenContent />
    </LightScope>
  );
}
