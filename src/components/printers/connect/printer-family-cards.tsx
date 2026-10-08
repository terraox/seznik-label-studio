import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  CONSUMER_PRINTER_LIST,
  type ConsumerPrinter,
  type ConsumerPrinterId,
} from '@/constants/printer-models';
import { Spacing } from '@/constants/theme';
import { cardShadow, Palette } from '@/constants/ui';

export const PRINTER_PHOTOS: Record<ConsumerPrinterId, number> = {
  tejas: require('../../../../assets/images/printer_tejas.png'),
  rudra: require('../../../../assets/images/printer_rudra.png'),
  josh: require('../../../../assets/images/printer_josh.png'),
};

type PrinterFamilyCardsProps = {
  selectedId: ConsumerPrinterId;
  onSelect: (id: ConsumerPrinterId) => void;
};

export function PrinterFamilyCards({ selectedId, onSelect }: PrinterFamilyCardsProps) {
  const selected = CONSUMER_PRINTER_LIST.find((printer) => printer.id === selectedId) ?? CONSUMER_PRINTER_LIST[0];

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Choose your printer</Text>
      <View style={styles.row}>
        {CONSUMER_PRINTER_LIST.map((printer) => (
          <FamilyCard
            key={printer.id}
            printer={printer}
            selected={printer.id === selectedId}
            onPress={() => onSelect(printer.id)}
          />
        ))}
      </View>
      <Text style={styles.note}>{selected.tagline}</Text>
    </View>
  );
}

function FamilyCard({
  printer,
  selected,
  onPress,
}: {
  printer: ConsumerPrinter;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.card, selected && { borderColor: printer.accent }, pressed && styles.pressed]}>
      <View style={styles.stage}>
        <Image source={PRINTER_PHOTOS[printer.id]} style={styles.photo} resizeMode="contain" />
        {selected ? (
          <View style={[styles.check, { backgroundColor: printer.accent }]}>
            <AppIcon name="checkmark" tintColor="#FFFFFF" size={11} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.name, selected && { color: printer.accent }]}>{printer.shortName}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: Spacing.three,
    gap: 12,
    ...cardShadow,
  },
  heading: { fontSize: 18, fontWeight: '700', color: Palette.ink },
  row: { flexDirection: 'row', gap: 10 },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 6,
    gap: 8,
  },
  stage: {
    height: 112,
    borderRadius: 14,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { textAlign: 'center', fontSize: 14, fontWeight: '700', color: Palette.ink },
  note: { fontSize: 13, lineHeight: 18, color: Palette.muted },
  pressed: { opacity: 0.8 },
});
