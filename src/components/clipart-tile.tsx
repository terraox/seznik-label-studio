import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { ClipartIcon } from '@/components/clipart-icon';
import { clipartImageUri, clipartSvgSource, type ClipartItem } from '@/lib/clipart/types';

export function ClipartTile({ item }: { item: ClipartItem }) {
  const svg = clipartSvgSource(item);
  const imageUri = clipartImageUri(item);
  return (
    <View style={styles.tile}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} contentFit="contain" />
      ) : svg ? (
        <ClipartIcon svg={svg} size={34} color="#111111" />
      ) : (
        <View style={styles.image} />
      )}
      <Text style={styles.label} numberOfLines={1}>
        {item.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#F4F6F8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
    minHeight: 76,
    borderWidth: 1,
    borderColor: '#E2E6EC',
    gap: 4,
    paddingHorizontal: 4,
  },
  image: { width: 34, height: 34 },
  label: {
    fontSize: 10,
    color: '#4B5563',
    fontWeight: '500',
  },
});
