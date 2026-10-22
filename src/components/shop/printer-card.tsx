import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ProductImage } from '@/components/shop/product-image';
import { useBuy } from '@/components/shop/use-buy';
import { androidRipple } from '@/constants/ui';
import type { ShopProduct } from '@/lib/shop/types';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

/** Printers this app drives directly. */
export const APP_PRINTERS = new Set(['tejas', 'rudra', 'josh']);

/** A printer: wide card for the ones this app works with, compact for the rest. */
export function PrinterCard({ product, width, featured }: { product: ShopProduct; width: number; featured?: boolean }) {
  useThemeRefresh();
  const { buy, opening, storeFor } = useBuy();
  const store = storeFor(product);
  return (
    <View style={[styles.card, featured && styles.featured, { width }]}>
      <View style={[styles.photo, featured && styles.photoFeatured]}>
        <ProductImage uri={product.imageUrl} recyclingKey={product.id} />
      </View>
      <View style={[styles.body, featured && styles.bodyFeatured]}>
        <Text style={[styles.name, featured && styles.nameFeatured]} numberOfLines={1}>
          Seznik {product.name}
        </Text>
        {featured ? <Text style={styles.works}>Prints straight from this app</Text> : <Text style={styles.type}>{product.type}</Text>}
        <Pressable
          onPress={() => void buy(product)}
          disabled={!store || opening != null}
          android_ripple={androidRipple}
          accessibilityRole="button"
          accessibilityLabel={store ? `Buy Seznik ${product.name} on ${store}` : `Seznik ${product.name} is not available`}
          style={({ pressed }) => [styles.buy, featured && styles.buyFeatured, pressed && styles.pressed, (!store || opening) && styles.disabled]}>
          {opening ? (
            <ActivityIndicator color={featured ? C.header : C.onAccent} size="small" />
          ) : (
            <Text style={[styles.buyText, featured && styles.buyTextFeatured]}>{store ? `Buy on ${store}` : 'Not available'}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  card: { backgroundColor: c.surface, borderRadius: 20, padding: 8, gap: 10, ...cardElevation(c, scheme) },
  featured: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.header, padding: 10, gap: 14 },
  photo: { borderRadius: 14, overflow: 'hidden', backgroundColor: c.fill },
  photoFeatured: { width: 112 },
  body: { paddingHorizontal: 6, paddingBottom: 6, gap: 4 },
  bodyFeatured: { flex: 1, paddingHorizontal: 0, paddingBottom: 0, gap: 6 },
  name: { fontSize: 15, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
  nameFeatured: { fontSize: 19, color: c.onAccent },
  type: { fontSize: 12, color: c.textSecondary },
  works: { fontSize: 13, color: 'rgba(255,255,255,0.75)' }, // theme-fixed: text on the navy header surface
  buy: { marginTop: 6, minHeight: 38, borderRadius: 12, backgroundColor: c.accentFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buyFeatured: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF' }, // theme-fixed: white button on navy
  buyText: { fontSize: 13, fontWeight: '700', color: c.onAccent },
  buyTextFeatured: { color: c.header },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
}));
