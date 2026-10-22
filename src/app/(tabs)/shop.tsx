import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { APP_PRINTERS, PrinterCard } from '@/components/shop/printer-card';
import { ProductSkeleton } from '@/components/shop/product-skeleton';
import { RollCard } from '@/components/shop/roll-card';
import { RollSheet } from '@/components/shop/roll-sheet';
import { SizeSwatch } from '@/components/shop/size-swatch';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { groupPrintersByCategory } from '@/lib/shop/filter-catalog';
import { loadShopCatalog } from '@/lib/shop/load-catalog';
import { groupRolls, sizeKeyFor, USE_CASES, type RollGroup, type UseCaseId } from '@/lib/shop/roll-groups';
import type { ShopCatalog, ShopCategory } from '@/lib/shop/types';
import { useLabelStore } from '@/stores/label-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const PAD = Spacing.three;
const GAP = 12;
/** One scale for the size strip, so a shipping label really looks bigger than a price tag. */
const STRIP_PX_PER_MM = 0.5;

export default function ShopScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tabPad = useTabBarPadding(Spacing.four);
  const listWidth = Math.min(windowWidth, MaxContentWidth);
  const cardWidth = (listWidth - PAD * 2 - GAP) / 2;

  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<ShopCategory>('labels');
  const [query, setQuery] = useState('');
  const [useCase, setUseCase] = useState<UseCaseId | null>(null);
  const [sizeKey, setSizeKey] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
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
  const sizedRolls = useMemo(() => {
    const seen = new Map<string, RollGroup>();
    for (const g of rolls) if (g.widthMm != null && !seen.has(g.sizeKey)) seen.set(g.sizeKey, g);
    return [...seen.values()];
  }, [rolls]);

  // Rolls in the sizes this person already designs labels at.
  const yourRolls = useMemo(() => {
    const keys = new Set(documents.map((d) => sizeKeyFor(d.widthMm, d.heightMm)));
    return rolls.filter((g) => keys.has(g.sizeKey));
  }, [documents, rolls]);

  const needle = query.trim().toLowerCase();
  const shownRolls = rolls.filter(
    (g) =>
      (!useCase || g.useCase === useCase) &&
      (!sizeKey || g.sizeKey === sizeKey) &&
      (!type || g.type === type) &&
      (!needle || `${g.title} ${g.type} ${g.cover.name}`.toLowerCase().includes(needle)),
  );
  const typesInView = [...new Set(rolls.filter((g) => (!useCase || g.useCase === useCase) && (!sizeKey || g.sizeKey === sizeKey)).map((g) => g.type))];
  const useTitle = USE_CASES.find((u) => u.id === useCase)?.title;
  const browsing = !useCase && !sizeKey && !type && !needle;

  const printers = catalog?.printers ?? [];
  const shownPrinters = printers.filter((p) => !needle || `${p.name} ${p.type}`.toLowerCase().includes(needle));
  const featured = shownPrinters.filter((p) => APP_PRINTERS.has(p.name.toLowerCase()));
  const otherGroups = groupPrintersByCategory(shownPrinters.filter((p) => !APP_PRINTERS.has(p.name.toLowerCase())));

  const clearFilters = () => {
    setUseCase(null);
    setSizeKey(null);
    setType(null);
    setQuery('');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={styles.headerTitle}>Shop</Text>
        <Text style={styles.headerSub}>Rolls and printers made for Seznik Print</Text>
        <View style={styles.segment} accessibilityRole="tablist">
          {(
            [
              { id: 'labels', label: 'Label rolls' },
              { id: 'printers', label: 'Printers' },
            ] as const
          ).map((item) => {
            const on = item.id === category;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setCategory(item.id);
                  clearFilters();
                }}
                style={[styles.segmentItem, on && styles.segmentItemOn]}>
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.search}>
          <AppIcon name="magnifyingglass" tintColor={C.textMuted} size={17} />
          <TextInput
            style={styles.searchInput}
            placeholder={category === 'labels' ? 'Search a size, like 50 × 25' : 'Search printers'}
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

        {!catalog && !loadError ? (
          <View style={styles.grid}>
            {Array.from({ length: 6 }, (_, i) => (
              <ProductSkeleton key={i} width={cardWidth} />
            ))}
          </View>
        ) : loadError ? (
          <Text style={styles.error}>{loadError}</Text>
        ) : category === 'labels' ? (
          <>
            {yourRolls.length > 0 && browsing ? (
              <View style={styles.section}>
                <Text style={styles.h2}>For the labels you make</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                  {yourRolls.map((g) => (
                    <RollCard key={g.key} group={g} width={Math.min(170, cardWidth)} onOpen={setOpen} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.h2}>What are you labelling?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {USE_CASES.map((u) => {
                  const on = useCase === u.id;
                  const count = rolls.filter((g) => g.useCase === u.id).length;
                  if (!count) return null;
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => {
                        setUseCase(on ? null : u.id);
                        setSizeKey(null);
                        setType(null);
                      }}
                      android_ripple={androidRipple}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.use, on && styles.useOn]}>
                      <Text style={[styles.useTitle, on && styles.useTitleOn]}>{u.title}</Text>
                      <Text style={[styles.useNote, on && styles.useNoteOn]}>{u.note}</Text>
                      <Text style={[styles.useCount, on && styles.useNoteOn]}>
                        {count} roll{count === 1 ? '' : 's'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={styles.h2}>Every size, drawn to scale</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                {sizedRolls.map((g) => {
                  const on = sizeKey === g.sizeKey;
                  return (
                    <Pressable
                      key={g.sizeKey}
                      onPress={() => {
                        setSizeKey(on ? null : g.sizeKey);
                        setUseCase(null);
                        setType(null);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Show ${g.title} rolls`}
                      style={styles.stripItem}>
                      <SizeSwatch
                        widthMm={g.widthMm!}
                        heightMm={g.heightMm!}
                        round={g.round}
                        pxPerMm={STRIP_PX_PER_MM}
                        caption={g.round ? `${g.widthMm} round` : `${g.widthMm}×${g.heightMm}`}
                        selected={on}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <View style={styles.listHead}>
                <Text style={styles.h2}>
                  {sizeKey ? `${sizedRolls.find((g) => g.sizeKey === sizeKey)?.title} rolls` : useTitle ? `${useTitle} rolls` : 'All rolls'}
                </Text>
                {!browsing ? (
                  <Pressable onPress={clearFilters} hitSlop={8}>
                    <Text style={styles.clear}>Show all</Text>
                  </Pressable>
                ) : null}
              </View>
              {typesInView.length > 1 ? (
                <View style={styles.types}>
                  {[null, ...typesInView].map((t) => {
                    const on = type === t;
                    return (
                      <Pressable key={t ?? 'all'} onPress={() => setType(t)} style={[styles.type, on && styles.typeOn]}>
                        <Text style={[styles.typeText, on && styles.typeTextOn]}>{t ?? 'Any finish'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {shownRolls.length ? (
                <View style={styles.grid}>
                  {shownRolls.map((g) => (
                    <RollCard key={g.key} group={g} width={cardWidth} onOpen={setOpen} />
                  ))}
                </View>
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No roll matches “{query || 'these filters'}”</Text>
                  <Text style={styles.emptyBody}>Try a size like 50 × 25, or show every roll.</Text>
                  <Pressable onPress={clearFilters} style={styles.emptyBtn}>
                    <Text style={styles.emptyBtnText}>Show every roll</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {featured.length ? (
              <View style={styles.section}>
                <Text style={styles.h2}>Works with this app</Text>
                <View style={styles.stack}>
                  {featured.map((p) => (
                    <PrinterCard key={p.id} product={p} width={listWidth - PAD * 2} featured />
                  ))}
                </View>
              </View>
            ) : null}
            {otherGroups.map((g) => (
              <View key={g.key} style={styles.section}>
                <Text style={styles.h2}>{g.title}</Text>
                <View style={styles.grid}>
                  {g.products.map((p) => (
                    <PrinterCard key={p.id} product={p} width={cardWidth} />
                  ))}
                </View>
              </View>
            ))}
            {shownPrinters.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No printer matches “{query}”</Text>
                <Pressable onPress={() => setQuery('')} style={styles.emptyBtn}>
                  <Text style={styles.emptyBtnText}>Show every printer</Text>
                </Pressable>
              </View>
            ) : null}
          </>
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
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: { color: c.onAccent, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }, // theme-fixed: text on the navy header
  segment: {
    flexDirection: 'row',
    marginTop: 14,
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)', // theme-fixed: track on the navy header
  },
  segmentItem: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentItemOn: { backgroundColor: '#FFFFFF' }, // theme-fixed: selected tab on the navy header
  segmentText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }, // theme-fixed: tab text on navy
  segmentTextOn: { color: c.header },
  scroll: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: { paddingHorizontal: PAD, paddingTop: 16, gap: 26 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  searchInput: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 10 },
  section: { gap: 12 },
  h2: { fontSize: 19, fontWeight: '800', color: c.text, letterSpacing: -0.4 },
  rail: { gap: 10, paddingRight: PAD },
  use: {
    width: 150,
    minHeight: 104,
    padding: 14,
    borderRadius: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    justifyContent: 'space-between',
  },
  useOn: { backgroundColor: c.header, borderColor: c.header },
  useTitle: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
  useTitleOn: { color: c.onAccent },
  useNote: { fontSize: 12, lineHeight: 16, color: c.textSecondary, marginTop: 4 },
  useNoteOn: { color: 'rgba(255,255,255,0.75)' }, // theme-fixed: text on the navy tile
  useCount: { fontSize: 12, fontWeight: '700', color: c.accentInk, marginTop: 10 },
  strip: { alignItems: 'flex-end', gap: 14, paddingRight: PAD, paddingVertical: 4 },
  stripItem: { alignItems: 'center' },
  listHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  clear: { fontSize: 14, fontWeight: '700', color: c.accent },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface, justifyContent: 'center' },
  typeOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
  typeText: { fontSize: 13, fontWeight: '600', color: c.text },
  typeTextOn: { color: c.accentInk, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  stack: { gap: GAP },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: c.text, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },
  emptyBtn: { marginTop: 10, height: 42, paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.accentFill, justifyContent: 'center' },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: c.onAccent },
  error: { fontSize: 14, color: c.textSecondary, textAlign: 'center', paddingVertical: 40 },
}));
