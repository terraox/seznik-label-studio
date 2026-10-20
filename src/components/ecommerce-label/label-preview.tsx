import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { bestRotation } from '@/lib/ecommerce-label/platforms';
import { rasterPdfPageCached, regionImageCached } from '@/lib/pdf-editor/raster';
import type { NormRect } from '@/lib/pdf-editor/smart-crop';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const PREVIEW_DPI = 150;

/** One crop of a PDF page, shown the way it will sit on the label (rotation included). */
export function LabelPreview({
  uri,
  pageIndex,
  rect,
  pageSizePt,
  size,
}: {
  uri: string;
  pageIndex: number;
  rect: NormRect;
  pageSizePt: { w: number; h: number };
  size: { widthMm: number; heightMm: number };
}) {
  useThemeRefresh();
  const [image, setImage] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const rotation = bestRotation(rect, pageSizePt, size);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    rasterPdfPageCached(uri, pageIndex, PREVIEW_DPI)
      .then((page) => regionImageCached(page.uri, rect))
      .then((region) => {
        if (!cancelled) setImage(region);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uri, pageIndex, rect]);

  // The label's shape, as large as fits the available width.
  const aspect = size.widthMm / Math.max(1, size.heightMm);

  return (
    <View style={styles.stage}>
      <View
        style={[styles.label, { aspectRatio: aspect }]}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {image ? (
          // A quarter turn swaps the axes, so the image is laid out sideways and then turned.
          <View
            style={[
              styles.turn,
              rotation === 90
                ? { width: box.h, height: box.w, transform: [{ rotate: '90deg' }] }
                : StyleSheet.absoluteFill,
            ]}>
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="contain" />
          </View>
        ) : (
          <ActivityIndicator color={C.accent} />
        )}
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  label: {
    width: '100%',
    maxHeight: '100%',
    backgroundColor: '#FFFFFF', // theme-fixed: a printed label is white paper
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  turn: { alignItems: 'center', justifyContent: 'center' },
}));
