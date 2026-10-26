import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RollCard } from '@/components/shop/roll-card';
import { SizeSwatch } from '@/components/shop/size-swatch';
import { androidRipple } from '@/constants/ui';
import { ShopGrid } from '@/lib/layout/screen-sizes';
import { sizeKeyFor, USE_CASES, type RollGroup, type UseCaseId } from '@/lib/shop/roll-groups';
import { useLabelStore } from '@/stores/label-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const { pad: PAD, gap: GAP } = ShopGrid;
/** One scale for the size strip, so a shipping label really looks bigger than a price tag. */
const STRIP_PX_PER_MM = 0.5;

/** Browse label rolls by what you label, by size drawn to scale, and by finish. */
export function ShopRolls({
  rolls,
  query,
  cardWidth,
  initialUseCase,
  onOpen,
  onClearQuery,
}: {
  rolls: RollGroup[];
  query: string;
  cardWidth: number;
  initialUseCase?: UseCaseId | null;
  onOpen: (g: RollGroup) => void;
  onClearQuery: () => void;
}) {
  useThemeRefresh();
  const documents = useLabelStore((s) => s.documents);
  const [useCase, setUseCase] = useState<UseCaseId | null>(initialUseCase ?? null);
  const [sizeKey, setSizeKey] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);

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
  const typesInView = [
    ...new Set(
      rolls
        .filter((g) => (!useCase || g.useCase === useCase) && (!sizeKey || g.sizeKey === sizeKey))
        .map((g) => g.type),
    ),
  ];
  const useTitle = USE_CASES.find((u) => u.id === useCase)?.title;
  const browsing = !useCase && !sizeKey && !type && !needle;

  const clearFilters = () => {
    setUseCase(null);
    setSizeKey(null);
    setType(null);
    onClearQuery();
  };

  return (
    <>
      {yourRolls.length > 0 && browsing ? (
        <View style={styles.section}>
          <Text style={styles.h2}>For the labels you make</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {yourRolls.map((g) => (
              <RollCard key={g.key} group={g} width={Math.min(170, cardWidth)} onOpen={onOpen} />
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
            {sizeKey
              ? `${sizedRolls.find((g) => g.sizeKey === sizeKey)?.title} rolls`
              : useTitle
                ? `${useTitle} rolls`
                : 'All rolls'}
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
              <RollCard key={g.key} group={g} width={cardWidth} onOpen={onOpen} />
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
  );
}

const styles = themedStyles((c) => ({
  section: { gap: 12 },
  h2: { fontSize: 19, fontWeight: '800', color: c.text, letterSpacing: -0.4, flexShrink: 1 },
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
  type: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.surface,
    justifyContent: 'center',
  },
  typeOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
  typeText: { fontSize: 13, fontWeight: '600', color: c.text },
  typeTextOn: { color: c.accentInk, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: c.text, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },
  emptyBtn: {
    marginTop: 10,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: c.accentFill,
    justifyContent: 'center',
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: c.onAccent },
}));
