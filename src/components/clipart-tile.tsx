import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { ClipartIcon } from '@/components/clipart-icon';
import { clipartImageUri, clipartSvgSource, type ClipartItem } from '@/lib/clipart/types';

export function ClipartTile({ item, size = 76 }: { item: ClipartItem; size?: number }) {
  const svg = clipartSvgSource(item);
  const imageUri = clipartImageUri(item);
  const iconSize = Math.max(22, Math.min(34, Math.round(size * 0.42)));
  return (
    <View style={[styles.tile, { minHeight: size }]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
      ) : svg ? (
        <ClipartIcon svg={svg} size={iconSize} color="#111111" fitInk={item.id.startsWith('le-')} />
      ) : (
        <View style={{ width: iconSize, height: iconSize }} />
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
    backgroundColor: '#F4F6F8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E6EC',
    gap: 2,
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  label: {
    fontSize: 10,
    color: '#4B5563',
    fontWeight: '500',
  },
});
