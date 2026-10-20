import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

export function EcommerceLabelCard() {
  useThemeRefresh();
  const router = useRouter();

  return (
    <View style={styles.frame}>
      <Pressable
        onPress={() => router.push('/ecommerce-label' as any)}
        android_ripple={androidRipple}
        accessibilityRole="button"
        accessibilityLabel="Print ecommerce shipping label — Amazon, Flipkart, Meesho"
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.badge}>
          <Ionicons name="cube-outline" size={20} color={C.onAccent} />
        </View>
        <View style={styles.text}>
          <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.title}>
            Shipping labels
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.subtitle}>
            Amazon · Flipkart · Meesho
          </Text>
        </View>
        <AppIcon name="chevron.right" tintColor={C.accent} size={14} />
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  frame: {
    borderRadius: 16,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: c.text },
  subtitle: { fontSize: 12, color: c.textMuted },
  pressed: { opacity: 0.85 },
}));
