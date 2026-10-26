import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { PrinterCard } from '@/components/shop/printer-card';
import { ProductSkeleton } from '@/components/shop/product-skeleton';
import { RollCard } from '@/components/shop/roll-card';
import { RollSheet } from '@/components/shop/roll-sheet';
import { ShopHome, type ShopGoTo } from '@/components/shop/shop-home';
import { ShopPrinters } from '@/components/shop/shop-printers';
import { ShopRolls } from '@/components/shop/shop-rolls';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ShopGrid, shopCardWidth, shopListWidth } from '@/lib/layout/screen-sizes';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { loadShopCatalog } from '@/lib/shop/load-catalog';
import { groupRolls, sizeKeyFor, type RollGroup, type UseCaseId } from '@/lib/shop/roll-groups';
import type { ShopCatalog } from '@/lib/shop/types';
import { useLabelStore } from '@/stores/label-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const { pad: PAD, gap: GAP } = ShopGrid;

type ShopView = 'home' | 'labels' | 'printers';
const VIEW_TITLE: Record<ShopView, string> = { home: 'Shop', labels: 'Label rolls', printers: 'Printers' };

export default function ShopScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tabPad = useTabBarPadding(Spacing.four);
  const listWidth = shopListWidth(windowWidth);
  const cardWidth = shopCardWidth(windowWidth);

  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ShopView>('home');
  const [preset, setPreset] = useState<{ useCase?: UseCaseId | null; type?: string | null }>({});
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<RollGroup | null>(null);
  const documents = useLabelStore((s) => s.documents);

  useEffect(() => {
    let active = true;
    void loadShopCatalog()
      .then((data) => active && (setCatalog(data), setLoadError(null)))
      .catch(() => active && setLoadError('The shop could not load. Check your connection and open Shop again.'));
    return () => {
      active = false;
    };
  }, []);

  const rolls = useMemo(() => (catalog ? groupRolls(catalog.labels) : []), [catalog]);
  const printers = catalog?.printers ?? [];

  // Rolls in the sizes this person already designs labels at.
  const yourRolls = useMemo(() => {
    const keys = new Set(documents.map((d) => sizeKeyFor(d.widthMm, d.heightMm)));
    return rolls.filter((g) => keys.has(g.sizeKey));
  }, [documents, rolls]);

  const go = useCallback((to: ShopGoTo) => {
    setQuery('');
    setPreset('useCase' in to ? { useCase: to.useCase } : { type: 'type' in to ? to.type : null });
    setView(to.view);
  }, []);
  const goHome = useCallback(() => {
    setQuery('');
    setPreset({});
    setView('home');
  }, []);

  // Android back inside printers or rolls returns to the shop home first.
  useFocusEffect(
    useCallback(() => {
      if (view === 'home') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goHome();
        return true;
      });
      return () => sub.remove();
    }, [view, goHome]),
  );

  const needle = query.trim().toLowerCase();
  const searching = view === 'home' && needle.length > 0;
  const foundPrinters = printers.filter((p) => `${p.name} ${p.type}`.toLowerCase().includes(needle));
  const foundRolls = rolls.filter((g) => `${g.title} ${g.type} ${g.cover.name}`.toLowerCase().includes(needle));

  const placeholder =
    view === 'printers' ? 'Search printers' : view === 'labels' ? 'Search a size, like 50 × 25' : 'Search printers and rolls';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.titleRow}>
          {view !== 'home' ? (
            <Pressable onPress={goHome} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to Shop" style={styles.back}>
              <AppIcon name="chevron.left" tintColor={C.onAccent} size={20} />
            </Pressable>
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {VIEW_TITLE[view]}
          </Text>
        </View>
        <Text style={styles.headerSub}>
          {view === 'home' ? 'Printers and rolls made for Seznik Print' : view === 'printers' ? 'Pick the printer for your work' : 'Pick the right roll for your labels'}
        </Text>
        <View style={styles.search}>
          <AppIcon name="magnifyingglass" tintColor={C.textMuted} size={17} />
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            placeholderTextColor={C.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <AppIcon name="xmark" tintColor={C.textMuted} size={16} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {!catalog && !loadError ? (
          <View style={styles.grid}>
            {Array.from({ length: 6 }, (_, i) => (
              <ProductSkeleton key={i} width={cardWidth} />
            ))}
          </View>
        ) : loadError ? (
          <Text style={styles.error}>{loadError}</Text>
        ) : searching ? (
          <>
            {foundPrinters.length ? (
              <View style={styles.section}>
                <Text style={styles.h2}>Printers</Text>
                <View style={styles.grid}>
                  {foundPrinters.map((p) => (
                    <PrinterCard key={p.id} product={p} width={cardWidth} />
                  ))}
                </View>
              </View>
            ) : null}
            {foundRolls.length ? (
              <View style={styles.section}>
                <Text style={styles.h2}>Label rolls</Text>
                <View style={styles.grid}>
                  {foundRolls.map((g) => (
                    <RollCard key={g.key} group={g} width={cardWidth} onOpen={setOpen} />
                  ))}
                </View>
              </View>
            ) : null}
            {!foundPrinters.length && !foundRolls.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Nothing matches “{query}”</Text>
                <Pressable onPress={() => setQuery('')} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>Clear search</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : view === 'home' ? (
          <ShopHome
            printers={printers}
            rolls={rolls}
            yourRolls={yourRolls}
            cardWidth={cardWidth}
            listWidth={listWidth}
            onGo={go}
            onOpenRoll={setOpen}
          />
        ) : view === 'labels' ? (
          <ShopRolls
            key={preset.useCase ?? 'all'}
            rolls={rolls}
            query={query}
            cardWidth={cardWidth}
            initialUseCase={preset.useCase}
            onOpen={setOpen}
            onClearQuery={() => setQuery('')}
          />
        ) : (
          <ShopPrinters
            key={preset.type ?? 'all'}
            printers={printers}
            query={query}
            cardWidth={cardWidth}
            listWidth={listWidth}
            initialType={preset.type}
            onClearQuery={() => setQuery('')}
          />
        )}
      </ScrollView>

      <RollSheet group={open} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg, alignItems: 'center' },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: c.header,
    paddingHorizontal: PAD,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { width: 32, height: 36, justifyContent: 'center', marginLeft: -6 },
  headerTitle: { flexShrink: 1, color: c.onAccent, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }, // theme-fixed: text on the navy header
  scroll: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: { paddingHorizontal: PAD, paddingTop: 18, gap: 26 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    marginTop: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: c.surface,
  },
  searchInput: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 10 },
  section: { gap: 12 },
  h2: { fontSize: 19, fontWeight: '800', color: c.text, letterSpacing: -0.4, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: c.text, textAlign: 'center' },
  emptyBtn: { marginTop: 10, height: 42, paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.accentFill, justifyContent: 'center' },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: c.onAccent },
  error: { fontSize: 14, color: c.textSecondary, textAlign: 'center', paddingVertical: 40 },
}));
