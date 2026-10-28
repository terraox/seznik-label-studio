import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import type { PrintStripItem } from '@/components/pdf-editor/print-pages-strip';
import { rasterPdfPageCached, regionImageCached } from '@/lib/pdf-editor/raster';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const PREVIEW_DPI = 150;
/** The whole label fits the stage at first; + zooms in and the stage then scrolls. */
const START_ZOOM = 1;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;
const STEP = 0.25;

/**
 * The labels a job will print, one at a time on the grey stage the normal Print screen uses, with
 * a Back / Next pill and zoom buttons.
 */
export function PrintPageViewer({
  uri,
  items,
  size,
}: {
  uri: string;
  items: PrintStripItem[];
  size: { widthMm: number; heightMm: number };
}) {
  useThemeRefresh();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(START_ZOOM);
  const [image, setImage] = useState<string | null>(null);

  const total = items.length;
  const at = Math.min(index, Math.max(0, total - 1));
  const item = items[at];
  const rect = item?.rect ?? null;
  const pageIndex = item?.pageIndex;

  useEffect(() => {
    if (pageIndex == null) return undefined;
    let cancelled = false;
    setImage(null);
    rasterPdfPageCached(uri, pageIndex, PREVIEW_DPI)
      .then((page) => (rect ? regionImageCached(page.uri, rect) : page.uri))
      .then((out) => {
        if (!cancelled) setImage(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uri, pageIndex, rect]);

  const stageH = Math.round(Math.min(480, Math.max(280, windowH * 0.5)));
  const aspect = size.widthMm / Math.max(1, size.heightMm);
  // Both the width and the height of the stage (minus its padding) bound the label, so none of it is cut off.
  const fitW = Math.min(windowW - 32, (stageH - 32) * aspect);
  const cardW = Math.round(fitW * zoom);
  const cardH = Math.round(cardW / aspect);
  const turned = item ? Math.abs(Math.round(item.rotation / 90)) % 2 === 1 : false;

  return (
    <View style={styles.wrap}>
      <View style={[styles.stage, { height: stageH }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: windowW }}>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.stageContent, { minHeight: stageH, minWidth: windowW }]}>
            <View style={[styles.card, { width: cardW, height: cardH }]}>
              {image ? (
                <View
                  style={
                    turned
                      ? { width: cardH, height: cardW, transform: [{ rotate: `${item?.rotation ?? 0}deg` }] }
                      : StyleSheet.absoluteFill
                  }>
                  <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="contain" />
                </View>
              ) : (
                <ActivityIndicator color={C.accent} />
              )}
            </View>
          </ScrollView>
        </ScrollView>

        <View style={styles.zoomControls}>
          <Pressable
            hitSlop={6}
            onPress={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - STEP) * 100) / 100))}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
            <Text style={styles.zoomText}>−</Text>
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable
            hitSlop={6}
            onPress={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + STEP) * 100) / 100))}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}>
            <Text style={styles.zoomText}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.sizeBadge}>
          <Text style={styles.sizeBadgeText}>
            {size.widthMm} × {size.heightMm} mm
          </Text>
        </View>
        {total > 1 ? (
          <View style={styles.pageNav}>
            <Pressable
              hitSlop={12}
              disabled={at <= 0}
              onPress={() => setIndex(at - 1)}
              style={({ pressed }) => [styles.pageNavBtn, pressed && styles.pressed]}>
              <AppIcon name="chevron.left" tintColor={at <= 0 ? '#7C848E' : '#FFFFFF'} /* theme-fixed: on the dark page-nav pill */ size={16} />
            </Pressable>
            <Text style={styles.pageNavText} numberOfLines={1}>
              Label {at + 1} / {total}
            </Text>
            <Pressable
              hitSlop={12}
              disabled={at >= total - 1}
              onPress={() => setIndex(at + 1)}
              style={({ pressed }) => [styles.pageNavBtn, pressed && styles.pressed]}>
              <AppIcon name="chevron.right" tintColor={at >= total - 1 ? '#7C848E' : '#FFFFFF'} /* theme-fixed: on the dark page-nav pill */ size={16} />
            </Pressable>
          </View>
        ) : null}
        {total === 0 ? <Text style={styles.empty}>No pages selected</Text> : null}
      </View>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  wrap: {},
  stage: {
    backgroundColor: scheme === 'light' ? '#AEB4BC' : c.canvasArea, // theme-fixed: light keeps its grey stage around the white label
    position: 'relative',
  },
  stageContent: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: {
    backgroundColor: '#FFFFFF', // theme-fixed: a printed label is white paper
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  meta: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    backgroundColor: c.fill,
  },
  sizeBadge: {
    backgroundColor: c.scrim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  sizeBadgeText: { color: c.onAccent, fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: c.neutralFill,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pageNavText: { color: c.onAccent, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  pageNavBtn: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 13, color: c.textMuted },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.neutralFill,
    borderRadius: 8,
    overflow: 'hidden',
  },
  zoomBtn: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.25)', // theme-fixed: divider on the dark zoom pill
  },
  zoomText: { color: c.onAccent, fontSize: 22, fontWeight: '500', lineHeight: 24 },
  pressed: { opacity: 0.75 },
}));
