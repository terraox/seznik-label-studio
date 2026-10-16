import { Text, View } from 'react-native';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export function KindTextGlyph({ active }: { active: boolean }) {
  useThemeRefresh();
  return (
    <View style={[styles.box, active && styles.boxOn]}>
      <Text style={[styles.letter, active && styles.letterOn]}>T</Text>
    </View>
  );
}

export function KindBarcodeGlyph({ active }: { active: boolean }) {
  useThemeRefresh();
  const color = active ? C.accent : C.textMuted;
  return (
    <View style={[styles.box, active && styles.boxOn, styles.barcodeBox]}>
      {[2, 1, 3, 1, 2, 1, 3, 1, 2].map((w, i) => (
        <View key={i} style={{ width: w, height: 16, backgroundColor: color, marginRight: 1 }} />
      ))}
    </View>
  );
}

export function KindQrGlyph({ active }: { active: boolean }) {
  useThemeRefresh();
  const color = active ? C.accent : C.textMuted;
  return (
    <View style={[styles.box, active && styles.boxOn, styles.qrBox]}>
      <View style={styles.qrGrid}>
        <Finder color={color} />
        <View style={{ width: 5 }} />
        <Finder color={color} />
      </View>
      <View style={[styles.qrMid, { backgroundColor: color }]} />
      <View style={styles.qrGrid}>
        <Finder color={color} />
        <View style={{ flex: 1 }} />
        <View style={[styles.qrDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function Finder({ color }: { color: string }) {
  useThemeRefresh();
  return (
    <View style={[styles.finder, { borderColor: color }]}>
      <View style={[styles.finderCore, { backgroundColor: color }]} />
    </View>
  );
}

const styles = themedStyles((c) => ({
  box: {
    width: 34,
    height: 34,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    borderColor: c.accent,
  },
  letter: {
    fontSize: 18,
    fontWeight: '700',
    color: c.textMuted,
  },
  letterOn: {
    color: c.accent,
  },
  barcodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  qrBox: {
    padding: 5,
    justifyContent: 'space-between',
  },
  qrGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrMid: {
    width: 4,
    height: 4,
    alignSelf: 'center',
  },
  qrDot: {
    width: 5,
    height: 5,
  },
  finder: {
    width: 10,
    height: 10,
    borderWidth: 1.5,
    padding: 1.5,
  },
  finderCore: {
    flex: 1,
  },
}));
