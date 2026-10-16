import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type TextInputProps, View } from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const AUTH_COLORS = {
  navy: '#12295C',
  blue: '#0A8CF0',
  text: '#0F172A',
  muted: '#64748B',
  border: '#D7DEE9',
  field: '#F5F7FB',
  error: '#DC2626',
  success: '#16A34A',
  background: '#FFFFFF',
};

export function AuthScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <FormScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <Image
        source={require('../../../assets/images/logo.png')}
        style={styles.logo}
        contentFit="contain"
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.form}>{children}</View>
    </FormScrollView>
  );
}

export function AuthField({
  label,
  error,
  prefix,
  right,
  ...input
}: TextInputProps & { label: string; error?: string | null; prefix?: string; right?: ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, !!error && styles.fieldError]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          style={styles.input}
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          autoCorrect={false}
          {...input}
        />
        {right}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
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
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function LinkText({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8}>
      <Text style={[styles.link, disabled && { color: AUTH_COLORS.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_COLORS.background },
  scroll: { paddingHorizontal: 24, flexGrow: 1 },
  logo: { width: 150, height: 150, alignSelf: 'center' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: AUTH_COLORS.navy,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: AUTH_COLORS.muted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  form: { gap: 16 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: AUTH_COLORS.text },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH_COLORS.field,
    borderWidth: 1,
    borderColor: AUTH_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
  },
  fieldError: { borderColor: AUTH_COLORS.error },
  prefix: { fontSize: 16, color: AUTH_COLORS.text, fontWeight: '600', marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: AUTH_COLORS.text, height: '100%' },
  error: { fontSize: 12, color: AUTH_COLORS.error },
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: AUTH_COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { backgroundColor: '#A9B4CC' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  link: { color: AUTH_COLORS.blue, fontSize: 14, fontWeight: '700' },
});
