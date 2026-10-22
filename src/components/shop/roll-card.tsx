import { Pressable, Text, View } from 'react-native';

import { ProductImage } from '@/components/shop/product-image';
import { SizeSwatch } from '@/components/shop/size-swatch';
import { androidRipple } from '@/constants/ui';
import { quantitySummary, ROLL_COLOURS, type RollGroup } from '@/lib/shop/roll-groups';
import { cardElevation, themedStyles, useThemeRefresh } from '@/theme';

/** One roll (a size and type), with its colours and pack sizes summed up. Opens the roll sheet. */
export function RollCard({ group, width, onOpen }: { group: RollGroup; width: number; onOpen: (g: RollGroup) => void }) {
  useThemeRefresh();
  const sized = group.widthMm != null && group.heightMm != null;
  // The swatch in the photo corner fits a 26 pt box, so its shape (tall, wide, round) reads at a glance.
  const fit = sized ? 26 / Math.max(group.widthMm!, group.heightMm!) : 0;
  return (
    <Pressable
      onPress={() => onOpen(group)}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel={`${group.title} ${group.type} roll, ${quantitySummary(group)}`}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}>
      <View style={styles.photo}>
        <ProductImage uri={group.cover.imageUrl} recyclingKey={group.cover.id} />
        {sized ? (
          <View style={styles.swatch}>
            <SizeSwatch widthMm={group.widthMm!} heightMm={group.heightMm!} round={group.round} pxPerMm={fit} />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {group.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {group.type} roll{group.quantities.length ? `, ${quantitySummary(group)}` : ''}
        </Text>
        {group.colours.length > 1 ? (
          <View style={styles.dots} accessibilityLabel={`${group.colours.length} colours`}>
            {group.colours.map((c) => (
              <View key={c} style={[styles.dot, { backgroundColor: ROLL_COLOURS[c].hex }]} />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = themedStyles((c, scheme) => ({
  card: { backgroundColor: c.surface, borderRadius: 20, padding: 8, gap: 10, ...cardElevation(c, scheme) },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  photo: { borderRadius: 14, overflow: 'hidden', backgroundColor: c.fill },
  swatch: { position: 'absolute', left: 8, bottom: 8 },
  body: { paddingHorizontal: 6, paddingBottom: 6, gap: 3 },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
  meta: { fontSize: 12.5, color: c.textSecondary },
  dots: { flexDirection: 'row', gap: 4, marginTop: 4 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: c.hairline },
}));
