import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { rasterPdfPageCached, regionImageCached } from '@/lib/pdf-editor/raster';
import type { NormRect } from '@/lib/pdf-editor/smart-crop';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export type PrintStripItem = {
  /** 0-based page of the source PDF. */
  pageIndex: number;
  /** Part of the page that prints. Null prints the whole page. */
  rect: NormRect | null;
  rotation: number;
};

const THUMB_W = 84;
const GAP = 10;
const THUMB_DPI = 100;

const Thumb = memo(function Thumb({
  uri,
  item,
  position,
  height,
}: {
  uri: string;
  item: PrintStripItem;
  position: number;
  height: number;
}) {
  useThemeRefresh();
  const [image, setImage] = useState<string | null>(null);
  const turned = Math.abs(Math.round(item.rotation / 90)) % 2 === 1;
  const rect = item.rect;

  useEffect(() => {
    let cancelled = false;
    rasterPdfPageCached(uri, item.pageIndex, THUMB_DPI)
      .then((page) => (rect ? regionImageCached(page.uri, rect) : page.uri))
      .then((out) => {
        if (!cancelled) setImage(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uri, item.pageIndex, rect]);

  return (
    <View style={styles.cell}>
      <View style={[styles.thumb, { width: THUMB_W, height }]}>
        {image ? (
          <View
            style={[
              styles.fill,
              turned
                ? { width: height, height: THUMB_W, transform: [{ rotate: `${item.rotation}deg` }] }
                : StyleSheet.absoluteFill,
            ]}>
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="contain" />
          </View>
        ) : (
          <ActivityIndicator size="small" color={C.accent} />
        )}
      </View>
      <Text style={styles.number}>{position + 1}</Text>
    </View>
  );
});

/** The pages (or label crops) a print job will send, in print order. */
export function PrintPagesStrip({
  uri,
  items,
  labelAspect,
}: {
  uri: string;
  items: PrintStripItem[];
  /** Label width / height. */
  labelAspect: number;
}) {
  useThemeRefresh();
  const height = Math.round(THUMB_W / Math.max(0.2, Math.min(5, labelAspect)));

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>
        {items.length === 0 ? 'No pages selected' : `${items.length} ${items.length === 1 ? 'page' : 'pages'} to print`}
      </Text>
      {items.length > 0 ? (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item, i) => `${item.pageIndex}-${item.rect?.y ?? 'p'}-${i}`}
          renderItem={({ item, index }) => <Thumb uri={uri} item={item} position={index} height={height} />}
          getItemLayout={(_, index) => ({ length: THUMB_W + GAP, offset: (THUMB_W + GAP) * index, index })}
          initialNumToRender={6}
          windowSize={5}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      ) : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { gap: 8 },
  caption: { fontSize: 13, fontWeight: '600', color: c.text, paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, gap: GAP },
  cell: { alignItems: 'center', gap: 4 },
  thumb: {
    backgroundColor: '#FFFFFF', // theme-fixed: a printed label is white paper
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 11, color: c.textMuted },
}));
