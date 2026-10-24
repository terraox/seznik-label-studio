import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import type { PlatformId } from '@/lib/ecommerce-label/platforms';
import { platformName } from '@/lib/ecommerce-label/platforms';
import { rasterPdfPageCached } from '@/lib/pdf-editor/raster';
import { C, themedStyles, useThemeRefresh } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

const SAMPLES: Record<PlatformId, number> = {
  amazon: require('../../../assets/samples/amazon.pdf'),
  flipkart: require('../../../assets/samples/flipkart.pdf'),
  meesho: require('../../../assets/samples/meesho.pdf'),
};

const SAMPLE_DPI = 110;
const MAX_PAGES = 6;

type Page = { uri: string; aspect: number };

/** A bundled sample label PDF, copied to a local file and rendered page by page inside the app. */
async function loadSample(id: PlatformId): Promise<Page[]> {
  const assetPackage = 'expo-asset';
  const { Asset } = require(assetPackage) as {
    Asset: {
      fromModule: (m: number) => { localUri: string | null; uri: string; downloadAsync: () => Promise<unknown> };
    };
  };
  const asset = Asset.fromModule(SAMPLES[id]);
  if (!asset.localUri) await asset.downloadAsync();
  const fileUri = asset.localUri ?? asset.uri;
  const first = await rasterPdfPageCached(fileUri, 0, SAMPLE_DPI);
  const pages: Page[] = [{ uri: first.uri, aspect: first.widthPx / first.heightPx }];
  const count = Math.min(first.pageCount, MAX_PAGES);
  for (let i = 1; i < count; i += 1) {
    const p = await rasterPdfPageCached(fileUri, i, SAMPLE_DPI);
    pages.push({ uri: p.uri, aspect: p.widthPx / p.heightPx });
  }
  return pages;
}

export function SamplePdfModal({
  platform,
  visible,
  onClose,
}: {
  platform: PlatformId;
  visible: boolean;
  onClose: () => void;
}) {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPages(null);
    setFailed(false);
    loadSample(platform)
      .then((p) => {
        if (!cancelled) setPages(p);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [platform, visible]);

  const pageW = width - 32;

  return (
    <Modal supportedOrientations={ALL_ORIENTATIONS} visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{platformName(platform)} sample label PDF</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close sample">
            <AppIcon name="xmark" size={20} tintColor={C.text} />
          </Pressable>
        </View>
        <Text style={styles.note}>This is how the PDF from your {platformName(platform)} seller panel looks.</Text>
        {failed ? (
          <View style={styles.center}>
            <Text style={styles.note}>The sample could not be opened.</Text>
          </View>
        ) : !pages ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.pages, { paddingBottom: insets.bottom + 16 }]}>
            {pages.map((p, i) => (
              <Image
                key={i}
                source={{ uri: p.uri }}
                style={[styles.page, { width: pageW, height: pageW / p.aspect }]}
                contentFit="contain"
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: c.text, flexShrink: 1 },
  note: { fontSize: 13, color: c.textSecondary, paddingHorizontal: 16, paddingBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pages: { paddingHorizontal: 16, gap: 12 },
  page: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: c.border }, // theme-fixed: paper stays white
}));
