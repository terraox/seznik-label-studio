import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AUTH_COLORS, AuthField, AuthScreen, PrimaryButton } from '@/components/auth/auth-ui';
import { digitsOnly, isValidPhone } from '@/lib/auth/validation';
import { useAuthStore } from '@/stores/auth-store';
import { LightScope } from '@/theme';

function LoginScreenContent() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isValidPhone(phone) && password.length > 0;

  const submit = () => {
    const result = login(phone, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/');
  };

  return (
    <AuthScreen title="Welcome back" subtitle="Log in to continue to Seznik">
      <AuthField
        label="Phone number"
        prefix="+91"
        placeholder="10-digit mobile number"
        keyboardType="number-pad"
        maxLength={10}
        value={phone}
        onChangeText={(v) => {
          setPhone(digitsOnly(v));
          setError(null);
        }}
      />
      <AuthField
        label="Password"
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Log in" onPress={submit} disabled={!canSubmit} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>New to Seznik? </Text>
        <Link href="/register" replace style={styles.footerLink}>
          Create account
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  toggle: { color: AUTH_COLORS.blue, fontWeight: '700', fontSize: 13 },
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
