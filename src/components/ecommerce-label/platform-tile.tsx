import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { androidRipple } from '@/constants/ui';
import type { PlatformId } from '@/lib/ecommerce-label/platforms';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

/** Marketplace logos, shown only to tell the user which marketplace's PDF to upload. */
const LOGO: Record<PlatformId, number> = {
  amazon: require('../../../assets/amazon.png'),
  flipkart: require('../../../assets/flipkart.png'),
  meesho: require('../../../assets/meesho.png'),
};

/** Where the seller downloads the label PDF from. */
const SOURCE: Record<PlatformId, string> = {
  amazon: 'Label PDF from Seller Central',
  flipkart: 'Label PDF from Seller Hub',
  meesho: 'Label PDF from the Supplier panel',
};

/** One full-width card per marketplace: its logo, its name and where the PDF comes from. */
export function PlatformTile({
  id,
  name,
  onPress,
}: {
  id: PlatformId;
  name: string;
  onPress: () => void;
}) {
  useThemeRefresh();

  return (
    <View style={styles.outer}>
      <Pressable
        onPress={onPress}
        android_ripple={androidRipple}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${SOURCE[id]}`}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.logoWrap}>
          <Image source={LOGO[id]} style={styles.logo} contentFit="cover" />
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.source} numberOfLines={2}>
            {SOURCE[id]}
          </Text>
        </View>
        <AppIcon name="chevron.right" size={16} tintColor={C.accent} />
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  outer: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    overflow: 'hidden',
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: '#FFFFFF', // theme-fixed: the Amazon logo is drawn on white
  },
  logo: { width: '100%', height: '100%' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 18, fontWeight: '700', color: c.text },
  source: { fontSize: 13, lineHeight: 18, color: c.textMuted },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
}));
