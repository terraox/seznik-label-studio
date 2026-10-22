import { Text, View } from 'react-native';

import { themedStyles, useThemeRefresh } from '@/theme';

type Props = {
  widthMm: number;
  heightMm: number;
  round?: boolean;
  /** Screen points per millimetre. Keep it the same across swatches to compare sizes. */
  pxPerMm: number;
  colour?: string;
  /** Print the size under the label. */
  caption?: string;
  selected?: boolean;
};

/** A label drawn to scale on its backing strip, the way it comes off the roll. */
export function SizeSwatch({ widthMm, heightMm, round, pxPerMm, colour = '#FFFFFF', caption, selected }: Props) {
  useThemeRefresh();
  const w = Math.max(6, widthMm * pxPerMm);
  const h = Math.max(6, heightMm * pxPerMm);
  const radius = round ? Math.min(w, h) / 2 : Math.min(4, Math.min(w, h) * 0.12);
  return (
    <View style={styles.wrap}>
      <View style={[styles.liner, { width: w + 10, height: h + 10 }, selected && styles.linerOn]}>
        <View style={[styles.label, { width: w, height: h, borderRadius: radius, backgroundColor: colour }]} />
      </View>
      {caption ? <Text style={[styles.caption, selected && styles.captionOn]}>{caption}</Text> : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { alignItems: 'center', gap: 6 },
  liner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#E9DFC9', // theme-fixed: label backing paper colour
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  linerOn: { borderColor: c.accent },
  label: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)', // theme-fixed: edge of a label on its backing
  },
  caption: { fontSize: 11, fontWeight: '600', color: c.textSecondary, fontVariant: ['tabular-nums'] },
  captionOn: { color: c.accentInk, fontWeight: '800' },
}));
