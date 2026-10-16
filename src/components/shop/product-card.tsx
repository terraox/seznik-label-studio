import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { ProductImage } from '@/components/shop/product-image';
import { androidRipple } from '@/constants/ui';
import { openAmazonUrl } from '@/lib/shop/amazon-url';
import { productDisplayTitle } from '@/lib/shop/filter-catalog';
import { typeTokens } from '@/lib/shop/parse-product';
import type { ShopProduct } from '@/lib/shop/types';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type Props = {
  product: ShopProduct;
  width: number;
};

export function ProductCard({ product, width }: Props) {
  useThemeRefresh();
  const [opening, setOpening] = useState(false);
  const types = typeTokens(product.type);
  const title = productDisplayTitle(product);

  async function onBuy() {
    if (opening) return;
    setOpening(true);
    try {
      const result = await openAmazonUrl(product.amazonUrl);
      if (!result.ok) {
        Alert.alert(
          'Link unavailable',
          'This Amazon link could not be opened. The product URL was not changed.',
        );
      }
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.clip}>
        <ProductImage uri={product.imageUrl} recyclingKey={product.id} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.meta}>
            {types.map((token) => (
              <View key={token} style={styles.typePill}>
                <Text style={styles.typeText} numberOfLines={1}>
                  {token}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.qty} numberOfLines={1}>
            {product.quantityLabel ?? ' '}
          </Text>
        </View>
        <Pressable
          onPress={() => void onBuy()}
          disabled={opening || !product.linkAudit.openable}
          android_ripple={androidRipple}
          accessibilityRole="button"
          accessibilityLabel={`Buy ${product.name} on Amazon`}
          style={({ pressed }) => [
            styles.buy,
            pressed && styles.buyPressed,
            (!product.linkAudit.openable || opening) && styles.buyDisabled,
          ]}>
          {opening ? (
            <ActivityIndicator color={C.onAccent} size="small" />
          ) : (
            <Text style={styles.buyLabel}>
              {product.linkAudit.openable ? 'Buy on Amazon' : 'Unavailable'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    ...cardElevation(c, scheme),
  },
  clip: {
    borderRadius: 16,
    overflow: 'hidden',
    paddingBottom: 10,
    backgroundColor: c.surface,
  },
  body: {
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 6,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    minHeight: 36,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.2,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    minHeight: 20,
  },
  typePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.accentSoft,
    maxWidth: '100%',
  },
  typeText: {
    fontSize: 10,
    fontWeight: '700',
    color: c.accentInk,
  },
  qty: {
    fontSize: 12,
    lineHeight: 16,
    minHeight: 16,
    color: c.textSecondary,
  },
  buy: {
    marginHorizontal: 10,
    marginTop: 8,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: c.header,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  buyPressed: {
    opacity: 0.88,
  },
  buyDisabled: {
    opacity: 0.55,
  },
  buyLabel: {
    color: c.onAccent,
    fontSize: 12,
    fontWeight: '700',
  },
}));
