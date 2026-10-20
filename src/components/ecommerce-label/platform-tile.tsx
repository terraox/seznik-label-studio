import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { androidRipple } from '@/constants/ui';
import type { PlatformId } from '@/lib/ecommerce-label/platforms';
import { cardElevation, themedStyles, useThemeRefresh } from '@/theme';

/** Marketplace logos, shown only to tell the user which marketplace's PDF to upload. */
const LOGO: Record<PlatformId, number> = {
  amazon: require('../../../assets/images/platforms/amazon.png'),
  flipkart: require('../../../assets/images/platforms/flipkart.png'),
  meesho: require('../../../assets/images/platforms/meesho.png'),
};

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
        accessibilityLabel={name}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
        <View style={styles.top}>
          <Image source={LOGO[id]} style={styles.logo} contentFit="contain" />
        </View>
        <View style={styles.bottom}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  outer: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  tile: { borderRadius: 20, overflow: 'hidden' },
  top: {
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF', // theme-fixed: the logos are drawn for a white ground
  },
  logo: { width: 68, height: 68 },
  bottom: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: c.hairline },
  name: { fontSize: 14, fontWeight: '700', color: c.text },
  pressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
}));
