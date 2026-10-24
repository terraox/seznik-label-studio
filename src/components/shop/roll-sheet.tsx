import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ProductImage } from '@/components/shop/product-image';
import { SizeSwatch } from '@/components/shop/size-swatch';
import { useBuy } from '@/components/shop/use-buy';
import { androidRipple } from '@/constants/ui';
import { pickVariant, ROLL_COLOURS, rollColour, USE_CASES, type RollColour, type RollGroup } from '@/lib/shop/roll-groups';
import { C, themedStyles, useThemeRefresh } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

/** Product page for one roll: see the label to scale, pick colour and pack, then buy. */
export function RollSheet({ group, onClose }: { group: RollGroup | null; onClose: () => void }) {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { buy, opening, storeFor } = useBuy();
  const [colour, setColour] = useState<RollColour>('white');
  const [quantity, setQuantity] = useState<number | null>(null);

  useEffect(() => {
    if (!group) return;
    setColour(rollColour(group.cover));
    setQuantity(group.cover.quantity);
  }, [group]);

  if (!group) return null;
  const product = pickVariant(group, colour, quantity);
  const quantitiesForColour = [...new Set(group.variants.filter((v) => rollColour(v) === colour).map((v) => v.quantity))]
    .filter((q): q is number => q != null)
    .sort((a, b) => a - b);
  const store = storeFor(product);
  const sized = group.widthMm != null && group.heightMm != null;
  const use = USE_CASES.find((u) => u.id === group.useCase);
  const swatchScale = sized ? Math.min(1.6, 120 / Math.max(group.widthMm!, group.heightMm!)) : 0;

  return (
    <Modal supportedOrientations={ALL_ORIENTATIONS} visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.top}>
              <View style={styles.photo}>
                <ProductImage uri={product.imageUrl} recyclingKey={product.id} />
              </View>
              {sized ? (
                <View style={styles.scaleBox}>
                  <SizeSwatch
                    widthMm={group.widthMm!}
                    heightMm={group.heightMm!}
                    round={group.round}
                    pxPerMm={swatchScale}
                    colour={ROLL_COLOURS[colour].hex}
                    caption={group.round ? `${group.widthMm} mm across` : `${group.widthMm} wide, ${group.heightMm} tall`}
                  />
                </View>
              ) : null}
            </View>

            <Text style={styles.title}>{group.title}</Text>
            <Text style={styles.sub}>
              {group.type} roll{use ? ` for ${use.title.toLowerCase()}` : ''}
            </Text>

            {group.colours.length > 1 ? (
              <View style={styles.block}>
                <Text style={styles.heading}>Colour: {ROLL_COLOURS[colour].label}</Text>
                <View style={styles.row}>
                  {group.colours.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setColour(c)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: c === colour }}
                      accessibilityLabel={ROLL_COLOURS[c].label}
                      style={[styles.colourRing, c === colour && styles.colourRingOn]}>
                      <View style={[styles.colour, { backgroundColor: ROLL_COLOURS[c].hex }]} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {quantitiesForColour.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.heading}>Labels on each roll</Text>
                <View style={styles.row}>
                  {quantitiesForColour.map((q) => {
                    const on = (product.quantity ?? null) === q;
                    return (
                      <Pressable
                        key={q}
                        onPress={() => setQuantity(q)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.pack, on && styles.packOn]}>
                        <Text style={[styles.packText, on && styles.packTextOn]}>{q.toLocaleString('en-IN')}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={() => void buy(product)}
            disabled={!store || opening != null}
            android_ripple={androidRipple}
            accessibilityRole="button"
            style={({ pressed }) => [styles.buy, pressed && styles.buyPressed, (!store || opening) && styles.buyDisabled]}>
            {opening ? (
              <ActivityIndicator color={C.onAccent} />
            ) : (
              <>
                <AppIcon name="bag" tintColor={C.onAccent} size={18} />
                <Text style={styles.buyText}>{store ? `Buy on ${store}` : 'Not available right now'}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }, // theme-fixed: scrim
  sheet: { maxHeight: '90%', backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.hairline, marginBottom: 12 },
  scroll: { paddingBottom: 16 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  photo: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: c.fill },
  scaleBox: { width: 130, borderRadius: 18, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', padding: 8 },
  title: { marginTop: 18, fontSize: 26, lineHeight: 30, fontWeight: '800', color: c.text, letterSpacing: -0.6 },
  sub: { marginTop: 4, fontSize: 14, color: c.textSecondary },
  block: { marginTop: 20, gap: 10 },
  heading: { fontSize: 14, fontWeight: '700', color: c.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colourRing: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colourRingOn: { borderColor: c.accent },
  colour: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c.hairline },
  pack: { minWidth: 72, height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: c.hairline, alignItems: 'center', justifyContent: 'center' },
  packOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  packText: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  packTextOn: { color: c.accentInk },
  buy: { minHeight: 54, borderRadius: 16, backgroundColor: c.accentFill, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buyPressed: { opacity: 0.9 },
  buyDisabled: { opacity: 0.5 },
  buyText: { fontSize: 16, fontWeight: '800', color: c.onAccent },
}));
