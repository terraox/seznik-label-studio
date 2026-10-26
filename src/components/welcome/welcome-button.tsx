import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { WelcomePalette } from '@/components/welcome/welcome-palette';

/** Pill button with a soft glow under it. White on dark, brand blue on light. */
export function WelcomeButton({
  label,
  palette,
  onPress,
  variant = 'solid',
}: {
  label: string;
  palette: WelcomePalette;
  onPress: () => void;
  /** Solid for the main action, outline for the other one. */
  variant?: 'solid' | 'outline';
}) {
  const solid = variant === 'solid';
  const press = useSharedValue(0);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.03 * press.value }] }));
  return (
    <Animated.View
      style={[
        styles.wrap,
        solid && {
          shadowColor: palette.buttonGlow,
          shadowOpacity: palette.buttonBg === '#FFFFFF' ? 0.55 : 0.35,
        },
        solid && styles.glow,
        lift,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 160 });
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.button,
          solid
            ? { backgroundColor: palette.buttonBg }
            : {
                backgroundColor: palette.outlineFill,
                borderWidth: 1.5,
                borderColor: palette.outlineBorder,
              },
        ]}
      >
        <Text
          style={[styles.label, { color: solid ? palette.buttonText : palette.outlineText }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  glow: {
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 22,
    elevation: 10,
  },
  button: {
    height: 58,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: { flexShrink: 1, fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
});
