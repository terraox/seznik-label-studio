import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { androidRipple, cardShadow, HomeLayout } from '@/constants/ui';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const ITEMS = [
  'Label rolls',
  'TD-404 ribbon',
  'Shipping labels',
  'Jewellery tags',
  'Thermal paper',
  'Care labels',
];

const LOOP_WIDTH = 780;

export function BuyFromUsStrip() {
  useThemeRefresh();
  const router = useRouter();
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = 0;
    offset.value = withRepeat(
      withTiming(-LOOP_WIDTH / 2, {
        duration: 14000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [offset]);

  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const chips = [...ITEMS, ...ITEMS];

  return (
    <Pressable
      onPress={() => router.push('/shop')}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel="Buy from us — Shop from Seznik"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <AppIcon name="bag.fill" tintColor={C.onAccent} size={18} />
        </View>
        <View style={styles.headerText}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
            style={styles.title}>
            Buy from us
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
            style={styles.subtitle}>
            Shop supplies from Seznik
          </Text>
        </View>
        <View style={styles.ctaWrap}>
          <Text style={styles.cta}>Shop</Text>
          <AppIcon name="chevron.right" tintColor={C.accent} size={14} />
        </View>
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.row, marqueeStyle]}>
          {chips.map((label, index) => (
            <View key={`${label}-${index}`} style={styles.chip}>
              <Text numberOfLines={1} style={styles.chipText}>
                {label}
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = themedStyles((c) => ({
  card: {
    minHeight: HomeLayout.buyStripHeight,
    backgroundColor: c.surface,
    borderRadius: 16,
    overflow: 'hidden',
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
    ...cardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: c.textMuted,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cta: {
    fontSize: 14,
    fontWeight: '700',
    color: c.accent,
  },
  track: {
    height: 38,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    width: LOOP_WIDTH,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: c.accent,
  },
  pressed: {
    opacity: 0.85,
  },
}));
