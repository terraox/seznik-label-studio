import { Pressable, ScrollView, Text, View } from 'react-native';

import { APP_PRINTERS, PrinterCard } from '@/components/shop/printer-card';
import { RollCard } from '@/components/shop/roll-card';
import { ShopGrid } from '@/lib/layout/screen-sizes';
import { groupPrintersByCategory } from '@/lib/shop/filter-catalog';
import { USE_CASES, type RollGroup, type UseCaseId } from '@/lib/shop/roll-groups';
import type { ShopProduct } from '@/lib/shop/types';
import { themedStyles, useThemeRefresh } from '@/theme';

const { pad: PAD } = ShopGrid;

export type ShopGoTo =
  | { view: 'printers'; type?: string | null }
  | { view: 'labels'; useCase?: UseCaseId | null };

/**
 * Shop landing: the rolls this person already uses first, then printers (the ones that work with
 * this app highlighted), then every other product grouped by category. "See all" opens that
 * category with its own browsing options.
 */
export function ShopHome({
  printers,
  rolls,
  yourRolls,
  cardWidth,
  listWidth,
  onGo,
  onOpenRoll,
}: {
  printers: ShopProduct[];
  rolls: RollGroup[];
  yourRolls: RollGroup[];
  cardWidth: number;
  listWidth: number;
  onGo: (to: ShopGoTo) => void;
  onOpenRoll: (g: RollGroup) => void;
}) {
  useThemeRefresh();
  const featured = printers.filter((p) => APP_PRINTERS.has(p.name.toLowerCase()));
  const kinds = groupPrintersByCategory(printers.filter((p) => !APP_PRINTERS.has(p.name.toLowerCase())));
  const railWidth = Math.min(listWidth - PAD * 2 - 28, 340);
  const tileWidth = Math.min(170, cardWidth);

  return (
    <>
      {yourRolls.length ? (
        <View style={styles.section}>
          <SectionHead
            title="Rolls for the labels you make"
            note="In the sizes you design at"
            onMore={() => onGo({ view: 'labels' })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {yourRolls.map((g) => (
              <RollCard key={g.key} group={g} width={tileWidth} onOpen={onOpenRoll} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {featured.length ? (
        <View style={styles.section}>
          <SectionHead
            title="Printers that work with this app"
            note="Print straight from Seznik Print"
            onMore={() => onGo({ view: 'printers' })}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={railWidth + 12}
            decelerationRate="fast"
            contentContainerStyle={styles.rail}>
            {featured.map((p) => (
              <PrinterCard key={p.id} product={p} width={railWidth} featured />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {kinds.map((k) => (
        <View key={k.key} style={styles.section}>
          <SectionHead
            title={k.title}
            note={`${k.products.length} printer${k.products.length === 1 ? '' : 's'}`}
            onMore={() => onGo({ view: 'printers', type: k.key })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {k.products.map((p) => (
              <PrinterCard key={p.id} product={p} width={tileWidth} />
            ))}
          </ScrollView>
        </View>
      ))}

      {USE_CASES.map((u) => {
        const group = rolls.filter((g) => g.useCase === u.id);
        if (!group.length) return null;
        return (
          <View key={u.id} style={styles.section}>
            <SectionHead
              title={u.title}
              note={u.note}
              onMore={() => onGo({ view: 'labels', useCase: u.id })}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {group.map((g) => (
                <RollCard key={g.key} group={g} width={tileWidth} onOpen={onOpenRoll} />
              ))}
            </ScrollView>
          </View>
        );
      })}
    </>
  );
}

function SectionHead({ title, note, onMore }: { title: string; note?: string; onMore: () => void }) {
  return (
    <View style={styles.head}>
      <View style={styles.headCopy}>
        <Text style={styles.h2} numberOfLines={1}>
          {title}
        </Text>
        {note ? (
          <Text style={styles.note} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button" accessibilityLabel={`See all ${title}`}>
        <Text style={styles.more}>See all</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c) => ({
  section: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headCopy: { flexShrink: 1, gap: 1 },
  h2: { fontSize: 19, fontWeight: '800', color: c.text, letterSpacing: -0.4, flexShrink: 1 },
  note: { fontSize: 12.5, color: c.textSecondary, flexShrink: 1 },
  more: { fontSize: 14, fontWeight: '700', color: c.accent },
  rail: { gap: 12, paddingRight: PAD },
}));
