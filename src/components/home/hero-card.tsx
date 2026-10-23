import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { HOME_TOOLS } from '@/components/home/home-tools';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

const WHITE = '#FFFFFF'; // theme-fixed: drawn on the fixed navy hero
const INK = '#24275A'; // theme-fixed: label paper content stays navy in both themes

const BARS: [number, number][] = [
  [30, 2], [34, 1.2], [37, 3], [42, 1.2], [45, 2], [49, 1.2], [52, 3], [57, 1.2], [60, 2], [64, 3], [69, 1.2], [72, 2],
];
const QR_DOTS: [number, number][] = [[4, 4], [5, 5], [6, 4], [4, 6], [6, 6], [5, 3]];

/** A small QR mark: three finder squares and a few modules, `size` wide. */
function QrMark({ x, y, size }: { x: number; y: number; size: number }) {
  const c = size / 7;
  return (
    <G>
      {[[0, 0], [4, 0], [0, 4]].map(([fx, fy]) => (
        <Rect key={`${fx}${fy}`} x={x + fx * c} y={y + fy * c} width={3 * c} height={3 * c} fill="none" stroke={INK} strokeWidth={c * 0.8} />
      ))}
      {QR_DOTS.map(([a, b]) => (
        <Rect key={`${a}${b}`} x={x + a * c} y={y + b * c} width={c} height={c} fill={INK} />
      ))}
    </G>
  );
}

/**
 * A blank label being designed: a text line selected with the editor's cyan box and handles,
 * a barcode and a QR code, and a "+" for adding more. Sits in the card's bottom-right corner.
 */
function NewLabelDesignArt() {
  const cyan = C.accent;
  return (
    <Svg width={160} height={120} viewBox="0 0 160 120" accessibilityElementsHidden importantForAccessibility="no">
      <G rotation={-6} origin="80, 62">
        <Rect x={18} y={24} width={124} height={80} rx={10} fill={WHITE} />
        <Rect x={28} y={36} width={70} height={22} rx={2} fill="none" stroke={cyan} strokeWidth={1.8} strokeDasharray="4 2.5" />
        <SvgText x={33} y={53} fontSize={15} fontWeight="800" fill={INK}>
          Aa
        </SvgText>
        <Rect x={57} y={44} width={34} height={3.4} rx={1.7} fill={INK} fillOpacity={0.35} />
        <Rect x={57} y={50} width={24} height={3.4} rx={1.7} fill={INK} fillOpacity={0.35} />
        <Circle cx={98} cy={47} r={3.6} fill={cyan} stroke={WHITE} strokeWidth={1.4} />
        <Circle cx={63} cy={58} r={3.6} fill={cyan} stroke={WHITE} strokeWidth={1.4} />
        {BARS.map(([bx, bw]) => (
          <Rect key={bx} x={bx} y={70} width={bw} height={18} fill={INK} />
        ))}
        <Rect x={30} y={90} width={44} height={3} rx={1.5} fill={INK} fillOpacity={0.3} />
        <QrMark x={104} y={66} size={24} />
      </G>
      <Circle cx={138} cy={26} r={14} fill={cyan} stroke={WHITE} strokeWidth={2.4} />
      <Path d="M138 19v14M131 26h14" stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export function HeroCard() {
  useThemeRefresh();
  const router = useRouter();
  const tool = HOME_TOOLS.newLabel;

  return (
    <Pressable
      onPress={() => router.push(tool.href as any)}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel="Design a new label: pick a size, add text, barcodes, QR codes and images"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.art}>
        <NewLabelDesignArt />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.title}>
          Design a new label
        </Text>
        <Text numberOfLines={3} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.detail}>
          Pick a size, add text, barcodes, QR and images
        </Text>
      </View>
      {/* The whole card is the button; this pill only shows what tapping does. */}
      <View style={styles.cta}>
        <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.ctaText}>
          Create label
        </Text>
      </View>
    </Pressable>
  );
}

const styles = themedStyles((c, scheme) => ({
  card: {
    minHeight: HomeLayout.heroHeight,
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: 14,
    backgroundColor: c.header,
    ...cardElevation(c, scheme),
  },
  art: {
    position: 'absolute',
    right: 2,
    bottom: -14,
  },
  copy: {
    gap: 4,
  },
  title: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '700',
  },
  detail: {
    color: WHITE,
    opacity: 0.75,
    fontSize: 12.5,
    lineHeight: 17,
    // Keeps the description clear of the drawn label on narrow phones.
    marginRight: 150,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: WHITE,
  },
  ctaText: {
    color: c.header,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.9,
  },
}));
