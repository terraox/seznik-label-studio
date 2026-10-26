import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { APP_PRINTERS, PrinterCard } from '@/components/shop/printer-card';
import { ShopGrid } from '@/lib/layout/screen-sizes';
import { groupPrintersByCategory } from '@/lib/shop/filter-catalog';
import type { ShopProduct } from '@/lib/shop/types';
import { themedStyles, useThemeRefresh } from '@/theme';

const { pad: PAD, gap: GAP } = ShopGrid;

const isAppPrinter = (p: ShopProduct) => APP_PRINTERS.has(p.name.toLowerCase());

/** Browse printers: the ones that print from this app first, then by kind of printer. */
export function ShopPrinters({
  printers,
  query,
  cardWidth,
  listWidth,
  initialType,
  onClearQuery,
}: {
  printers: ShopProduct[];
  query: string;
  cardWidth: number;
  listWidth: number;
  initialType?: string | null;
  onClearQuery: () => void;
}) {
  useThemeRefresh();
  const [type, setType] = useState<string | null>(initialType ?? null);
  const [appOnly, setAppOnly] = useState(false);

  const needle = query.trim().toLowerCase();
  const matching = printers.filter((p) => !needle || `${p.name} ${p.type}`.toLowerCase().includes(needle));
  const kinds = groupPrintersByCategory(printers);
  const shown = matching.filter((p) => (!type || p.type === type) && (!appOnly || isAppPrinter(p)));
  const featured = shown.filter(isAppPrinter);
  const others = groupPrintersByCategory(shown.filter((p) => !isAppPrinter(p)));
  const filtered = type != null || appOnly;

  const reset = () => {
    setType(null);
    setAppOnly(false);
    onClearQuery();
  };

  return (
    <>
      <View style={styles.options}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={`All ${printers.length}`} on={type == null && !appOnly} onPress={reset} />
          <Chip
            label="Prints from this app"
            on={appOnly}
            onPress={() => setAppOnly((v) => !v)}
            accent
          />
          {kinds.map((k) => (
            <Chip
              key={k.key}
              label={`${k.title} ${k.products.length}`}
              on={type === k.key}
              onPress={() => setType(type === k.key ? null : k.key)}
            />
          ))}
        </ScrollView>
      </View>

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

      {others.map((g) => (
        <View key={g.key} style={styles.section}>
          <Text style={styles.h2}>{g.title}</Text>
          <View style={styles.grid}>
            {g.products.map((p) => (
              <PrinterCard key={p.id} product={p} width={cardWidth} />
            ))}
          </View>
        </View>
      ))}

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {needle ? `No printer matches “${query}”` : 'No printers in this view'}
          </Text>
          {filtered || needle ? (
            <Pressable onPress={reset} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Show every printer</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function Chip({ label, on, onPress, accent }: { label: string; on: boolean; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, accent && styles.chipAccent, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles((c) => ({
  options: { marginHorizontal: -PAD },
  chips: { gap: 8, paddingHorizontal: PAD },
  chip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.surface,
    justifyContent: 'center',
  },
  chipAccent: { borderColor: c.accent },
  chipOn: { backgroundColor: c.header, borderColor: c.header },
  chipText: { fontSize: 13.5, fontWeight: '700', color: c.text },
  chipTextOn: { color: c.onAccent },
  section: { gap: 12 },
  h2: { fontSize: 19, fontWeight: '800', color: c.text, letterSpacing: -0.4, flexShrink: 1 },
  stack: { gap: GAP },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: c.text, textAlign: 'center' },
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
