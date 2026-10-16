import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BorderPreview } from '@/components/border-preview';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import {
  BORDER_CATEGORIES,
  BORDER_LIBRARY,
  borderStyleStrokeMm,
  type BorderStyleId,
} from '@/constants/border-library';
import { editorBridge } from '@/constants/editor-bridge';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { cardShadow } from '@/constants/ui';
import { joshBorderGapMm } from '@/lib/printer/josh-print';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { td404BorderGapMm } from '@/lib/printer/print-spec';
import { themedStyles, useThemeRefresh } from '@/theme';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function BorderLibraryScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    from?: string;
    style?: string;
    edgeGap?: string;
  }>();
  const from = firstParam(params.from);
  const applying = from === 'edit' || from === 'label-settings';
  const requested = firstParam(params.style);
  const [selectedId, setSelectedId] = useState<BorderStyleId>(
    requested && BORDER_LIBRARY.some((item) => item.id === requested)
      ? (requested as BorderStyleId)
      : BORDER_LIBRARY[0].id,
  );
  const [category, setCategory] = useState<(typeof BORDER_CATEGORIES)[number]>('All');

  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);
  const tileWidth = Math.floor((contentWidth - Spacing.two) / 2);

  const filteredBorders = useMemo(() => {
    if (category === 'All') return BORDER_LIBRARY;
    return BORDER_LIBRARY.filter((item) => item.category === category);
  }, [category]);

  const choose = (id: BorderStyleId) => {
    setSelectedId(id);
    if (!applying) return;
    const parsedGap = Number(firstParam(params.edgeGap));
    const clampGap = getPrinterManager().usesTd404CommandSet ? td404BorderGapMm : joshBorderGapMm;
    editorBridge.borderResult = {
      style: id,
      lineWidth: borderStyleStrokeMm(id),
      edgeGapMm: clampGap(Number.isFinite(parsedGap) ? parsedGap : undefined),
    };
    router.back();
  };

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Border" />

      {!applying ? (
        <Text style={[styles.browseHint, { width: contentWidth }]}>
          Browsing borders. To apply one, open Border from the editor toolbar.
        </Text>
      ) : null}

      <View style={[styles.chipRow, { width: contentWidth }]}>
        {BORDER_CATEGORIES.map((item) => {
          const active = item === category;
          return (
            <Pressable
              key={item}
              onPress={() => setCategory(item)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filteredBorders}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: Spacing.two, justifyContent: 'center' }}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
          alignItems: 'center',
          gap: Spacing.two,
        }}
        renderItem={({ item }) => {
          const active = item.id === selectedId;
          return (
            <Pressable
              onPress={() => choose(item.id)}
              style={({ pressed }) => [
                styles.card,
                { width: tileWidth },
                active && styles.cardActive,
                pressed && styles.pressed,
              ]}>
              <View style={styles.previewBox}>
                <BorderPreview styleId={item.id} />
              </View>
              <Text style={styles.borderName}>{item.name}</Text>
              <Text style={styles.borderCategory}>{item.category}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  browseHint: {
    color: c.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: c.fillStrong,
  },
  chipActive: {
    backgroundColor: c.accentFill,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
  },
  chipTextActive: {
    color: c.onAccent,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 10,
    padding: Spacing.two,
    ...cardShadow,
  },
  cardActive: {
    borderWidth: 1.5,
    borderColor: c.accent,
  },
  previewBox: {
    height: 88,
    backgroundColor: '#EEF1F5', // theme-fixed: light preview (previewBox)
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  borderName: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
  },
  borderCategory: {
    marginTop: 2,
    fontSize: 11,
    color: c.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
}));
