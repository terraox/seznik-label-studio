import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { PLATFORMS, type PlatformId } from '@/lib/ecommerce-label/platforms';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

const LOGO: Record<PlatformId, number> = {
  amazon: require('../../../assets/amazon.png'),
  flipkart: require('../../../assets/flipkart.png'),
  meesho: require('../../../assets/meesho.png'),
};

// theme-fixed: the drawings are paper (white) with navy print, the same in light and dark.
const WHITE = '#FFFFFF';
const INK = '#24275A';
const PDF_RED = '#D9412B';
const SHADOW = '#05061F';

/** Art box shared by both drawings; it scales to the card's width. */
const ART_W = 296;
const ART_H = 110;

function Bars({ x, y, h, widths, gap }: { x: number; y: number; h: number; widths: number[]; gap: number }) {
  return (
    <G>
      {widths.map((w, i) => (
        <Rect key={i} x={x + i * gap} y={y} width={w} height={h} fill={INK} />
      ))}
    </G>
  );
}

function SoftShadow({ x, y, w, h, r }: { x: number; y: number; w: number; h: number; r: number }) {
  return (
    <G>
      {[1, 2, 3, 4, 5].map((i) => (
        <Rect key={i} x={x - i} y={y + 3 + i * 0.6 - i} width={w + 2 * i} height={h + 2 * i} rx={r + i} fill={SHADOW} fillOpacity={0.05} />
      ))}
    </G>
  );
}

function Arrow({ y, cyan }: { y: number; cyan: string }) {
  return (
    <G fill="none" stroke={cyan} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={`M132 ${y} C 146 ${y - 12}, 160 ${y - 12}, 172 ${y - 4}`} />
      <Path d={`M166 ${y - 10}l7 6-8 3`} />
    </G>
  );
}

/** A marketplace A4 page whose label part is cropped out onto a 4 x 6 shipping label. */
function ShippingArt({ cyan }: { cyan: string }) {
  return (
    <Svg width="100%" height={ART_H} viewBox={`0 0 ${ART_W} ${ART_H}`} accessibilityElementsHidden importantForAccessibility="no">
      <Rect x={58} y={12} width={64} height={88} rx={4} fill={WHITE} stroke={INK} strokeWidth={1.6} />
      <Rect x={64} y={18} width={52} height={40} rx={2} fill="none" stroke={cyan} strokeWidth={1.6} strokeDasharray="4 3" />
      <Path d="M69 25h22M69 30h30M69 35h16" stroke={INK} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
      <Bars x={69} y={41} h={11} gap={2.6} widths={[1.4, 0.8, 1.8, 0.8, 1.4, 0.8, 1.8, 1, 1.4, 0.8, 1.6, 0.8]} />
      <Path d="M64 62h52" stroke={INK} strokeOpacity={0.25} strokeDasharray="2 2" />
      <Path d="M64 66h52M64 72h40M64 78h46M64 84h30" stroke={INK} strokeOpacity={0.18} strokeWidth={2} strokeLinecap="round" />
      <Arrow y={52} cyan={cyan} />
      <SoftShadow x={184} y={14} w={58} h={86} r={6} />
      <Rect x={184} y={14} width={58} height={86} rx={6} fill={WHITE} stroke={INK} strokeWidth={1.6} />
      <Path d="M184 26v-6a6 6 0 0 1 6-6h46a6 6 0 0 1 6 6v6z" fill={cyan} />
      <Path d="M191 34h30M191 40h40M191 46h24" stroke={INK} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
      <Bars x={191} y={56} h={22} gap={3.4} widths={[1.8, 1, 2.4, 1, 1.8, 1, 2.4, 1.2, 1.8, 1, 2.2, 1, 1.6]} />
      <Path d="M191 86h28M191 92h18" stroke={INK} strokeOpacity={0.3} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Any PDF page with a crop window you set, turning into a label (the cyan tag used on Home). */
function AnyPdfArt({ cyan, soft }: { cyan: string; soft: string }) {
  const corners: [number, number][] = [[67, 62], [117, 62], [67, 78], [117, 78]];
  return (
    <Svg width="100%" height={ART_H} viewBox={`0 0 ${ART_W} ${ART_H}`} accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M66 12h38l18 18v62a5 5 0 0 1-5 5H66a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5z" fill={WHITE} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M104 12v13a5 5 0 0 0 5 5h13" fill={soft} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M70 40h40M70 46h32M70 52h44M70 58h28M70 82h36M70 88h22" stroke={INK} strokeOpacity={0.2} strokeWidth={2} strokeLinecap="round" />
      <Rect x={67} y={62} width={50} height={16} rx={2} fill={cyan} fillOpacity={0.12} stroke={cyan} strokeWidth={1.6} />
      <Path d="M72 70h26" stroke={INK} strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
      {corners.map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x - 2.4} y={y - 2.4} width={4.8} height={4.8} rx={1.2} fill={WHITE} stroke={cyan} strokeWidth={1.4} />
      ))}
      <Rect x={50} y={22} width={30} height={13} rx={3} fill={PDF_RED} />
      <SvgText x={65} y={31.6} fontSize={8.5} fontWeight="800" fill={WHITE} textAnchor="middle">
        PDF
      </SvgText>
      <Arrow y={70} cyan={cyan} />
      <SoftShadow x={182} y={46} w={70} h={40} r={7} />
      <Rect x={182} y={46} width={70} height={40} rx={7} fill={cyan} stroke={INK} strokeWidth={1.6} />
      <Circle cx={191} cy={66} r={2.6} fill={WHITE} />
      <Path d="M199 61h40M199 71h28" stroke={WHITE} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

function PlatformChips() {
  return (
    <View style={styles.chips} accessibilityElementsHidden importantForAccessibility="no">
      {PLATFORMS.map((p) => (
        <View key={p.id} style={styles.chip}>
          <Image source={LOGO[p.id]} style={styles.chipLogo} contentFit="cover" />
          <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.chipText}>
            {p.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OptionCard({
  title,
  hint,
  accessibilityLabel,
  onPress,
  disabled,
  art,
  tint,
  footer,
}: {
  title: string;
  hint: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  art: ReactNode;
  tint: string;
  footer?: ReactNode;
}) {
  useThemeRefresh();
  return (
    <View style={styles.cardOuter}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        android_ripple={androidRipple}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, disabled && styles.disabled]}>
        <View style={[styles.art, { backgroundColor: tint }]}>{art}</View>
        <View style={styles.body}>
          <View style={styles.copy}>
            <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.title}>
              {title}
            </Text>
            <Text numberOfLines={3} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.hint}>
              {hint}
            </Text>
          </View>
          <View style={styles.go}>
            <AppIcon name="chevron.right" size={16} tintColor={C.accentInk} />
          </View>
        </View>
        {footer}
      </Pressable>
    </View>
  );
}

/** First step of Print PDF: marketplace shipping labels, or any PDF. */
export function PdfPickOptions({
  onShippingLabels,
  onPrintPdf,
  disabled,
}: {
  onShippingLabels: () => void;
  onPrintPdf: () => void;
  disabled?: boolean;
}) {
  useThemeRefresh();

  return (
    <View style={styles.wrap}>
      <View style={styles.intro}>
        <Text maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.heading}>
          What are you printing?
        </Text>
        <Text maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.sub}>
          Choose the kind of PDF you have.
        </Text>
      </View>
      <OptionCard
        title="Shipping labels"
        hint="Amazon, Flipkart and Meesho PDFs crop to a 4 × 6 label on their own."
        accessibilityLabel="Shipping labels: Amazon, Flipkart and Meesho PDFs crop to a 4 by 6 label on their own"
        onPress={onShippingLabels}
        disabled={disabled}
        tint={C.accentSoft}
        art={<ShippingArt cyan={C.accent} />}
        footer={<PlatformChips />}
      />
      <OptionCard
        title="Any PDF"
        hint="Pick the page, set the label size and crop the part you need."
        accessibilityLabel="Any PDF: pick the page, set the label size and crop the part you need"
        onPress={onPrintPdf}
        disabled={disabled}
        tint={C.fill}
        art={<AnyPdfArt cyan={C.accent} soft={C.accentSoft} />}
      />
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  wrap: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: 14,
    paddingHorizontal: 16,
  },
  intro: {
    gap: 4,
    marginBottom: 4,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: c.text,
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    color: c.textMuted,
  },
  cardOuter: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  card: {
    padding: 8,
    paddingBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    gap: 12,
  },
  art: {
    height: ART_H + 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: c.text,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: c.textMuted,
  },
  go: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 5,
    paddingRight: 14,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: c.fill,
  },
  chipLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: '#FFFFFF', // theme-fixed: the Amazon logo is drawn on white
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: c.text,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
  },
}));
