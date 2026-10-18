import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { grayToPngBase64 } from '@/lib/printer/escpos';
import type { ModedTileView } from '@/components/editor/use-moded-tile';

/** The finished print dots of a moded image, drawn into the element's box. */
export function ModedTileImage({
  view,
  widthPx,
  heightPx,
}: {
  view: ModedTileView | null;
  widthPx: number;
  heightPx: number;
}) {
  const uri = useMemo(
    () =>
      view
        ? `data:image/png;base64,${grayToPngBase64({ width: view.tile.width, height: view.tile.height, gray: view.tile.gray })}`
        : null,
    [view],
  );
  if (!view || !uri) return <View style={styles.fill} />;
  const w = Math.max(1, (view.tile.width / view.boxWidthDots) * widthPx);
  const h = Math.max(1, (view.tile.height / view.boxHeightDots) * heightPx);
  return (
    <View style={[styles.fill, styles.center]}>
      <Image source={{ uri }} style={{ width: w, height: h }} contentFit="fill" cachePolicy="memory" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
