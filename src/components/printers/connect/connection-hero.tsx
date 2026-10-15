import { Image, StyleSheet, Text, View } from 'react-native';

import type { ConsumerPrinterId } from '@/constants/printer-models';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import type { PrinterConnectionStatus } from '@/stores/printer-store';

import { PRINTER_PHOTOS } from './printer-family-cards';

type ConnectionHeroProps = {
  status: PrinterConnectionStatus;
  deviceName: string | null;
  modelName: string;
  modelId: ConsumerPrinterId;
};

export function ConnectionHero({ status, deviceName, modelName, modelId }: ConnectionHeroProps) {
  const connected = status === 'connected' || status === 'printing';
  const scanning = status === 'scanning';
  const title = connected ? deviceName || modelName : scanning ? 'Looking nearby' : 'Ready to connect';
  const detail = connected
    ? `${modelName} is ready to print`
    : scanning
      ? 'Keep the printer on and close to the phone'
      : `Scan, then tap the ${modelName} in the list`;

  return (
    <View style={[styles.card, connected && styles.cardOn]}>
      <View style={styles.thumb}>
        <Image source={PRINTER_PHOTOS[modelId]} style={styles.photo} resizeMode="contain" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <View style={[styles.dot, connected ? styles.dotOn : scanning ? styles.dotBusy : styles.dotOff]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing.two,
    paddingRight: Spacing.three,
  },
  cardOn: { borderColor: '#BBE5CD', backgroundColor: '#F4FBF7' },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#050505',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: '#18794A' },
  dotBusy: { backgroundColor: '#B45309' },
  dotOff: { backgroundColor: '#CBD5E1' },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: Palette.ink },
  detail: { fontSize: 13, lineHeight: 18, color: Palette.muted },
});
