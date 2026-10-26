import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextInput as RNTextInput,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';

import { authPalette, useAuthColors } from '@/components/auth/auth-colors';
import { makeStyles } from '@/theme';
import { OTP_BOX, OTP_GLOW } from '@/components/auth/otp/config';
import { VerifiedAnimation } from '@/components/auth/otp/verified-animation';
import { TextInput } from '@/components/ui/text-input';

/** One box: the digit pops in, and a highlight travels across the row while a code is checked. */
function OtpBox({
  index,
  count,
  char,
  active,
  invalid,
  verifying,
  wave,
}: {
  index: number;
  count: number;
  char: string;
  active: boolean;
  invalid?: boolean;
  verifying?: boolean;
  wave: SharedValue<number>;
}) {
  const styles = useStyles();
  const A = useAuthColors();
  const waveStyle = useAnimatedStyle(() => {
    const phase = (((wave.value - index / count) % 1) + 1) % 1;
    const k = phase < 0.45 ? Math.sin((Math.PI * phase) / 0.45) : 0;
    return {
      borderColor: interpolateColor(k, [0, 1], [A.otpRestBorder, OTP_GLOW.accent]),
      shadowOpacity: 0.7 * k,
    };
  });
  return (
    <Animated.View
      style={[
        styles.box,
        Boolean(char) && styles.boxFilled,
        active && styles.boxActive,
        invalid && styles.boxInvalid,
        verifying && styles.boxWave,
        verifying && waveStyle,
      ]}
    >
      {char ? (
        <Animated.Text key={char + index} entering={ZoomIn.duration(140)} style={styles.digit}>
          {char}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

function VerifiedLabel() {
  const styles = useStyles();
  return (
    <Animated.Text style={styles.verifiedLabel} entering={FadeIn.duration(260)}>
      Verified successfully
    </Animated.Text>
  );
}

/**
 * Boxes over one hidden input. Autofills the SMS code and calls onComplete when full. While a code
 * is being checked a highlight runs across the boxes; when it verifies, the verified animation
 * plays over them and `onSuccessDone` fires as it finishes.
 */
export function OtpBoxes({
  value,
  onChange,
  onComplete,
  length,
  invalid,
  autoFocus,
  hint,
  verifying,
  success,
  onSuccessDone,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length: number;
  invalid?: boolean;
  autoFocus?: boolean;
  hint?: string;
  verifying?: boolean;
  success?: boolean;
  onSuccessDone?: () => void;
}) {
  const styles = useStyles();
  const ref = useRef<RNTextInput>(null);
  const [focused, setFocused] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  const shake = useSharedValue(0);
  const wave = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (!invalid) return;
    shake.value = withSequence(
      withTiming(-9, { duration: 55 }),
      withTiming(9, { duration: 90 }),
      withTiming(-6, { duration: 80 }),
      withTiming(0, { duration: 60 }),
    );
  }, [invalid, shake]);

  useEffect(() => {
    if (!verifying) {
      cancelAnimation(wave);
      wave.value = 0;
      return;
    }
    wave.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(wave);
  }, [verifying, wave]);

  useEffect(() => {
    if (!autoFocus) return;
    const id = setTimeout(() => ref.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [autoFocus]);

  const change = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const playing = Boolean(success) && rowWidth > 0;

  return (
    <View style={styles.block}>
      <View style={styles.top}>
        {playing ? (
          <VerifiedLabel key="verified" />
        ) : hint ? (
          <Animated.Text
            key="hint"
            exiting={FadeOut.duration(140)}
            style={[styles.hint, StyleSheet.absoluteFill]}
          >
            {hint}
          </Animated.Text>
        ) : null}
      </View>
      <Animated.View style={shakeStyle}>
        {/* The row stays mounted (just hidden) so the keyboard and layout do not jump. */}
        <Pressable
          style={[styles.row, playing && styles.rowHidden]}
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
          onPress={() => ref.current?.focus()}
        >
          {Array.from({ length }, (_, i) => (
            <OtpBox
              key={i}
              index={i}
              count={length}
              char={value[i] ?? ''}
              active={focused && !success && i === Math.min(value.length, length - 1)}
              invalid={invalid}
              verifying={verifying && !success}
              wave={wave}
            />
          ))}
          <TextInput
            ref={ref}
            value={value}
            onChangeText={change}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!verifying && !success}
            keyboardType="number-pad"
            maxLength={length}
            selectTextOnFocus={false}
            underlineColorAndroid="transparent"
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
            caretHidden
            style={styles.hidden}
          />
        </Pressable>
        {playing ? (
          <View style={styles.overlay} pointerEvents="none">
            <VerifiedAnimation digits={value} width={rowWidth} onDone={() => onSuccessDone?.()} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((_c, scheme) => {
  const A = authPalette(scheme);
  return {
    block: { gap: 10 },
    top: { minHeight: 20, justifyContent: 'center' },
    hint: { fontSize: 13, color: A.muted, textAlign: 'center', lineHeight: 18 },
    verifiedLabel: {
      fontSize: 15,
      fontWeight: '800',
      color: A.text,
      textAlign: 'center',
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: OTP_BOX.gap },
    rowHidden: { opacity: 0 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, height: OTP_BOX.height },
    box: {
      flex: 1,
      height: OTP_BOX.height,
      borderRadius: OTP_BOX.radius,
      borderWidth: 1.5,
      borderColor: A.border,
      backgroundColor: A.field,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxFilled: { borderColor: A.otpRestBorder, backgroundColor: A.otpRestFill },
    boxActive: { borderColor: OTP_GLOW.accent, backgroundColor: A.otpActiveFill },
    boxInvalid: { borderColor: A.error },
    boxWave: {
      shadowColor: OTP_GLOW.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 10,
    },
    digit: { fontSize: 22, fontWeight: '800', color: A.text },
    hidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.02 },
  } as const;
});
