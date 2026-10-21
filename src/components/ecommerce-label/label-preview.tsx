import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { rasterPdfPageCached, regionImageCached } from '@/lib/pdf-editor/raster';
import type { NormRect } from '@/lib/pdf-editor/smart-crop';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const PREVIEW_DPI = 150;

/** One crop of a PDF page, shown the way it will sit on the label. */
export function LabelPreview({
  uri,
  pageIndex,
  rect,
  size,
}: {
  uri: string;
  pageIndex: number;
  rect: NormRect;
  size: { widthMm: number; heightMm: number };
}) {
  useThemeRefresh();
  const [image, setImage] = useState<string | null>(null);

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
      <View style={[styles.label, { aspectRatio: aspect }]}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="contain" />
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
}));
