import { Pressable, Text, View } from 'react-native';

import { ProductImage } from '@/components/shop/product-image';
import { androidRipple } from '@/constants/ui';
import { quantitySummary, ROLL_COLOURS, type RollGroup } from '@/lib/shop/roll-groups';
import { cardElevation, themedStyles, useThemeRefresh } from '@/theme';

/** One roll (a size and type), with its colours and pack sizes summed up. Opens the roll sheet. */
export function RollCard({ group, width, onOpen }: { group: RollGroup; width: number; onOpen: (g: RollGroup) => void }) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={() => onOpen(group)}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel={`${group.title} ${group.type} roll, ${quantitySummary(group)}`}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}>
      <View style={styles.photo}>
        <ProductImage uri={group.cover.imageUrl} recyclingKey={group.cover.id} />
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
  body: { paddingHorizontal: 6, paddingBottom: 6, gap: 3 },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '800', color: c.text, letterSpacing: -0.3 },
  meta: { fontSize: 12.5, color: c.textSecondary },
  dots: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: c.hairline },
}));
