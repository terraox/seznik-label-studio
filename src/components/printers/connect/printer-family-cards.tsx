import { Image, Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  CONSUMER_PRINTER_LIST,
  type ConsumerPrinter,
  type ConsumerPrinterId,
} from '@/constants/printer-models';
import { Spacing } from '@/constants/theme';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

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
  useThemeRefresh();

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
      <PrinterMatchNotice />
    </View>
  );
}

function PrinterMatchNotice() {
  useThemeRefresh();
  return (
    <View style={styles.notice}>
      <AppIcon name="exclamationmark.triangle.fill" tintColor={C.warning} size={16} />
      <Text style={styles.noticeText}>
        <Text style={styles.noticeStrong}>Connect to the right printer </Text>
        for the best print quality and accurate label sizing.
      </Text>
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
  useThemeRefresh();
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
            <AppIcon name="checkmark" tintColor={C.onAccent} size={11} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.name, selected && { color: printer.accent }]}>{printer.shortName}</Text>
    </Pressable>
  );
}

const styles = themedStyles((c, scheme) => ({
  wrap: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: Spacing.three,
    gap: 12,
    ...cardElevation(c, scheme),
  },
  heading: { fontSize: 18, fontWeight: '700', color: c.text },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: c.warningSoft,
  },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: c.onWarningSoft },
  noticeStrong: { fontWeight: '700' },
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
    backgroundColor: '#050505', // theme-fixed: black backdrop for the printer photo
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
  name: { textAlign: 'center', fontSize: 14, fontWeight: '700', color: c.text },
  pressed: { opacity: 0.8 },
}));
