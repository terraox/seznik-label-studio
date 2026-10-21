import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { CONSUMER_PRINTER_LIST } from '@/constants/printer-models';
import { Spacing } from '@/constants/theme';
import { cardElevation, makeStyles } from '@/theme';

// Small copies of the printer photos: the full 1024px PNGs decode slowly for a ~64dp tile.
const PHOTOS = {
  tejas: require('../../assets/images/notice/printer_tejas.png'),
  rudra: require('../../assets/images/notice/printer_rudra.png'),
  josh: require('../../assets/images/notice/printer_josh.png'),
} as const;

/** Settings card listing the printers the app works with: photo and name. */
export function SupportedPrintersSection() {
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Printers we support</Text>
      <Text style={styles.note}>
        Sez Print works with these printers right now. More are on the way.
      </Text>
      <View style={styles.row}>
        {CONSUMER_PRINTER_LIST.map((p) => (
          <View key={p.id} style={styles.printer}>
            <View style={styles.stage}>
              <Image source={PHOTOS[p.id]} style={styles.photo} contentFit="contain" cachePolicy="memory" />
            </View>
            <Text style={[styles.name, { color: p.accent }]} numberOfLines={1}>
              {p.shortName}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, scheme) => ({
  card: {
    width: '100%',
    backgroundColor: c.surface,
    borderRadius: 10,
    ...cardElevation(c, scheme),
    padding: Spacing.three,
    gap: Spacing.two,
  },
  title: { fontSize: 16, fontWeight: '600', color: c.text },
  note: { fontSize: 13, lineHeight: 19, color: c.textSecondary },
  row: { flexDirection: 'row', gap: 10, marginTop: Spacing.one },
  printer: { flex: 1, gap: 6, alignItems: 'center' },
  stage: {
    width: '100%',
    height: 96,
    borderRadius: 14,
    backgroundColor: '#FFFFFF', // theme-fixed: white backdrop so the dark printer photo stays visible
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  name: { fontSize: 13, fontWeight: '700' },
}));
