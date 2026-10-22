import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type Props = {
  uri: string;
  recyclingKey: string;
};

export function ProductImage({ uri, recyclingKey }: Props) {
  useThemeRefresh();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={styles.frame} accessibilityLabel="Product image unavailable">
        <AppIcon name="photo" tintColor={C.textMuted} size={26} />
      </View>
    );
  }
  return (
    <View style={styles.frame}>
      <Image
        source={{ uri }}
        recyclingKey={recyclingKey}
        cachePolicy="memory-disk"
        contentFit="contain"
        transition={120}
        style={styles.image}
        onError={() => setFailed(true)}
        accessibilityLabel="Product image"
      />
    </View>
  );
}

const styles = themedStyles((c) => ({
  frame: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '88%',
    height: '88%',
  },
}));
