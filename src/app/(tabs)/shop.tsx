import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ProductCard } from '@/components/shop/product-card';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import {
  filterShopProducts,
  formatSizeKey,
  groupPrintersByCategory,
  uniqueSizes,
  uniqueTypes,
} from '@/lib/shop/filter-catalog';
import { loadShopCatalog } from '@/lib/shop/load-catalog';
import type { ShopCatalog, ShopCategory, ShopProduct } from '@/lib/shop/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const GRID_COLUMNS = 2;
const GRID_GAP = 12;
const GRID_PAD = Spacing.three;

const CATEGORIES: { id: ShopCategory; label: string }[] = [
  { id: 'printers', label: 'Seznik Printers' },
  { id: 'labels', label: 'Label Rolls' },
];

type ShopListSection = {
  key: string;
  title: string | null;
  products: ShopProduct[];
};

export default function ShopScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tabPad = useTabBarPadding(Spacing.four);
  const listWidth = Math.min(windowWidth, MaxContentWidth);
  const cardWidth =
    (listWidth - GRID_PAD * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<ShopCategory>('labels');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadShopCatalog()
      .then((data) => {
        if (active) {
          setCatalog(data);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (active) setLoadError('The shop catalogue could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  const sourceProducts = catalog
    ? category === 'printers'
      ? catalog.printers
      : catalog.labels
    : [];
  const types = useMemo(() => uniqueTypes(sourceProducts), [sourceProducts]);
  const sizes = useMemo(() => uniqueSizes(sourceProducts), [sourceProducts]);
  const products = useMemo(
    () =>
      catalog
        ? filterShopProducts(category === 'printers' ? catalog.printers : catalog.labels, {
            category,
            query,
            type,
            size,
          })
        : [],
    [catalog, category, query, type, size],
  );
  const sections = useMemo<ShopListSection[]>(() => {
    if (category === 'printers') {
      return groupPrintersByCategory(products).map((group) => ({
        ...group,
        title: group.title,
      }));
    }
    if (products.length === 0) return [];
    return [{ key: 'labels-grid', title: null, products }];
  }, [category, products]);

  function renderEmpty() {
    if (category === 'printers') {
      if (!catalog || catalog.printers.length === 0) {
        return (
          <View style={styles.empty}>
            <AppIcon name="bag" tintColor={C.brandInk} size={22} />
            <Text style={styles.emptyTitle}>No printers</Text>
            <Text style={styles.emptyBody}>The printer catalogue is empty.</Text>
          </View>
        );
      }
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matching printers</Text>
          <Text style={styles.emptyBody}>Clear search or filters to see the full catalogue.</Text>
        </View>
      );
    }
    if (query || type || size) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matching labels</Text>
          <Text style={styles.emptyBody}>Clear search or filters to see the full catalogue.</Text>
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No products</Text>
        <Text style={styles.emptyBody}>The label catalogue is empty.</Text>
      </View>
    );
  }

  const noun = category === 'printers' ? 'printers' : 'labels';

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.pills}>
        {CATEGORIES.map((item) => {
          const active = item.id === category;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                setCategory(item.id);
                setType(null);
                setSize(null);
                setQuery('');
              }}
              android_ripple={androidRipple}
              style={[styles.pill, active && styles.pillActive]}>
              <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchWrap}>
        <AppIcon name="magnifyingglass" tintColor={C.textMuted} size={16} />
        <TextInput
          style={styles.searchInput}
          placeholder={
            category === 'printers' ? 'Search printer name or category' : 'Search name, type, or size'
          }
          placeholderTextColor={C.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      <Text style={styles.filterHeading}>Type</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}>
        <FilterChip label="All" active={type == null} onPress={() => setType(null)} />
        {types.map((item) => (
          <FilterChip
            key={item}
            label={item}
            active={type === item}
            onPress={() => setType(item === type ? null : item)}
          />
        ))}
      </ScrollView>
      {category === 'labels' ? (
        <>
          <Text style={styles.filterHeading}>Size</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            <FilterChip label="All" active={size == null} onPress={() => setSize(null)} />
            {sizes.map((item) => (
              <FilterChip
                key={item}
                label={formatSizeKey(item)}
                active={size === item}
                onPress={() => setSize(item === size ? null : item)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}
      <Text style={styles.count}>
        {products.length} of {sourceProducts.length} {noun}
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerKicker}>Seznik</Text>
        <Text style={styles.headerTitle}>Shop</Text>
      </View>

      {!catalog && !loadError ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.accent} />
          <Text style={styles.centeredText}>Loading catalogue…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{loadError}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.scroll}
          data={sections}
          keyExtractor={(item: ShopListSection) => item.key}
          renderItem={({ item }) => (
            <View style={styles.group}>
              {item.title ? <Text style={styles.groupTitle}>{item.title}</Text> : null}
              <View style={styles.grid}>
                {item.products.map((product) => (
                  <ProductCard key={product.id} product={product} width={cardWidth} />
                ))}
              </View>
            </View>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={androidRipple}
      style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: c.header,
    paddingHorizontal: Spacing.four,
    paddingBottom: 12,
    justifyContent: 'flex-end',
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: c.onAccent,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  scroll: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: GRID_PAD,
    paddingTop: Spacing.three,
  },
  headerBlock: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  group: {
    gap: 10,
    marginBottom: Spacing.three,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  pills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  pillActive: {
    backgroundColor: c.header,
    borderColor: c.brandInk,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.text,
  },
  pillLabelActive: {
    color: c.onAccent,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: c.text,
    paddingVertical: 8,
  },
  filterHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  chipActive: {
    backgroundColor: c.header,
    borderColor: c.brandInk,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.text,
  },
  chipLabelActive: {
    color: c.onAccent,
  },
  count: {
    fontSize: 12,
    color: c.textSecondary,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 18,
    color: c.textSecondary,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  centeredText: {
    fontSize: 13,
    color: c.textSecondary,
  },
}));
