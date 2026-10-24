import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { HOME_TOOLS } from '@/components/home/home-tools';
import { HomeLayout } from '@/constants/ui';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

// theme-fixed: the hero is the same navy card in light and dark; everything on it is drawn for that.
const WHITE = '#FFFFFF';
const INK = '#24275A';
const PLACEHOLDER = '#A3A8C3';
const BG_TOP = '#2D3178';
const BG_BOTTOM = '#181A45';
const SHADOW = '#05061F';

/** The drawing's own box; it sits in the card's bottom-right corner. */
const ART_W = 200;
const ART_H = 160;
/** The drawing is shown a little under its own size, with this inset from the card's edges. */
const ART_SCALE = 0.84;
const ART_INSET = 6;

/** The blank label inside the drawing (a 50 x 30 mm label, to proportion). */
const L = { x: 50, y: 52, w: 130, h: 80 };
/** The text box just added to it. */
const TB = { x: L.x + 14, y: L.y + 18, w: 78, h: 20 };
/** The editor's add bar, floating above the label. */
const BAR = { x: 30, y: 10 };

/** A soft shadow made of a few widening, faint layers (filters are not reliable on every phone). */
function SoftShadow({ x, y, w, h, r, drop, layers, opacity }: { x: number; y: number; w: number; h: number; r: number; drop: number; layers: number; opacity: number }) {
  return (
    <G>
      {Array.from({ length: layers }, (_, k) => {
        const i = k + 1;
        return (
          <Rect key={i} x={x - i * 1.4} y={y + drop + i * 1.2 - i * 1.4} width={w + i * 2.8} height={h + i * 2.8} rx={r + i * 1.4} fill={SHADOW} fillOpacity={opacity} />
        );
      })}
    </G>
  );
}

/** A size callout: a line with end ticks and a cyan tag in the middle. */
function Dimension({ vertical, at, from, length, text, cyan }: { vertical?: boolean; at: number; from: number; length: number; text: string; cyan: string }) {
  const mid = from + length / 2;
  const d = vertical
    ? `M${at} ${from}v${length}M${at - 4} ${from}h8M${at - 4} ${from + length}h8`
    : `M${from} ${at}h${length}M${from} ${at - 4}v8M${from + length} ${at - 4}v8`;
  const [cx, cy] = vertical ? [at, mid] : [mid, at];
  return (
    <G>
      <Path d={d} stroke={cyan} strokeWidth={1.4} />
      <Rect x={cx - 19} y={cy - 8} width={38} height={16} rx={8} fill={cyan} />
      <SvgText x={cx} y={cy + 3.6} fontSize={9.5} fontWeight="800" fill={WHITE} textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}

/**
 * A brand-new label: blank, with a dashed safe margin and a text box just added (cursor and
 * placeholder), its size called out (50 x 30 mm), the editor's add bar above it and a "+" on its corner.
 */
function DesignArt({ scale, cyan }: { scale: number; cyan: string }) {
  const handles: [number, number][] = [[TB.x, TB.y], [TB.x + TB.w, TB.y], [TB.x, TB.y + TB.h], [TB.x + TB.w, TB.y + TB.h]];
  const plus = { x: L.x + L.w, y: L.y };
  return (
    <Svg width={ART_W * scale} height={ART_H * scale} viewBox={`0 0 ${ART_W} ${ART_H}`} accessibilityElementsHidden importantForAccessibility="no">
      <SoftShadow x={L.x} y={L.y} w={L.w} h={L.h} r={10} drop={5} layers={7} opacity={0.07} />
      <Rect x={L.x} y={L.y} width={L.w} height={L.h} rx={10} fill={WHITE} />
      <Rect x={L.x + 7} y={L.y + 7} width={L.w - 14} height={L.h - 14} rx={5} fill="none" stroke={INK} strokeOpacity={0.14} strokeWidth={1} strokeDasharray="3 3" />
      <Rect x={TB.x} y={TB.y} width={TB.w} height={TB.h} rx={1.5} fill={cyan} fillOpacity={0.08} stroke={cyan} strokeWidth={1.3} />
      <Rect x={TB.x + 6} y={TB.y + 4} width={1.8} height={12} rx={0.9} fill={cyan} />
      <SvgText x={TB.x + 11} y={TB.y + 14} fontSize={10.5} fontWeight="700" fill={PLACEHOLDER}>
        Your text
      </SvgText>
      {handles.map(([hx, hy]) => (
        <Rect key={`${hx}-${hy}`} x={hx - 2.6} y={hy - 2.6} width={5.2} height={5.2} rx={1.4} fill={WHITE} stroke={cyan} strokeWidth={1.4} />
      ))}

      <Dimension at={L.y + L.h + 12} from={L.x} length={L.w} text="50 mm" cyan={cyan} />
      <Dimension vertical at={L.x - 12} from={L.y} length={L.h} text="30 mm" cyan={cyan} />

      <SoftShadow x={BAR.x} y={BAR.y} w={118} h={32} r={16} drop={3} layers={5} opacity={0.08} />
      <Rect x={BAR.x} y={BAR.y} width={118} height={32} rx={16} fill={WHITE} />
      <Circle cx={BAR.x + 17} cy={BAR.y + 16} r={12} fill={cyan} />
      <SvgText x={BAR.x + 17} y={BAR.y + 21} fontSize={13} fontWeight="800" fill={WHITE} textAnchor="middle">
        T
      </SvgText>
      {[[0, 1.6], [2.6, 0.9], [4.4, 2], [7.4, 0.9], [9.2, 1.6], [11.8, 0.9], [13.6, 1.8]].map(([dx, w]) => (
        <Rect key={dx} x={BAR.x + 38 + dx} y={BAR.y + 10} width={w} height={12} fill={INK} />
      ))}
      <G fill="none" stroke={INK} strokeWidth={1.6}>
        <Rect x={BAR.x + 66} y={BAR.y + 9.5} width={5} height={5} />
        <Rect x={BAR.x + 74} y={BAR.y + 9.5} width={5} height={5} />
        <Rect x={BAR.x + 66} y={BAR.y + 17.5} width={5} height={5} />
      </G>
      <Rect x={BAR.x + 75} y={BAR.y + 18.5} width={3} height={3} fill={INK} />
      <Rect x={BAR.x + 90} y={BAR.y + 9} width={15} height={14} rx={3} fill="none" stroke={INK} strokeWidth={1.6} />
      <Path d={`M${BAR.x + 91} ${BAR.y + 21}l4-4.5 3 3 2-2 4 3.5`} fill="none" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={BAR.x + 101} cy={BAR.y + 13} r={1.6} fill={INK} />

      {[1, 2, 3, 4].map((i) => (
        <Circle key={i} cx={plus.x} cy={plus.y + 2 + i * 0.5} r={14 + i} fill={SHADOW} fillOpacity={0.08} />
      ))}
      <Circle cx={plus.x} cy={plus.y} r={14} fill={cyan} stroke={WHITE} strokeWidth={2.4} />
      <Path d={`M${plus.x} ${plus.y - 7}v14M${plus.x - 7} ${plus.y}h14`} stroke={WHITE} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Card background: navy-to-indigo, one cyan glow behind the label, and the editor's dot grid fading in. */
function HeroBackground({ w, h, glowX, glowY, glowScale, cyan }: { w: number; h: number; glowX: number; glowY: number; glowScale: number; cyan: string }) {
  const dots: { x: number; y: number; o: number }[] = [];
  for (let x = 0; x <= w; x += 11) {
    for (let y = 0; y <= h; y += 11) {
      const o = Math.min(0.14, ((x - w * 0.42) / (w * 0.58)) * 0.2);
      if (o > 0.01) dots.push({ x, y, o });
    }
  }
  return (
    <Svg width={w} height={h} style={styles.fill} accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="heroBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BG_TOP} />
          <Stop offset="1" stopColor={BG_BOTTOM} />
        </LinearGradient>
        <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={cyan} stopOpacity={0.38} />
          <Stop offset="1" stopColor={cyan} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#heroBg)" />
      <Ellipse cx={glowX} cy={glowY} rx={120 * glowScale} ry={95 * glowScale} fill="url(#heroGlow)" />
      {dots.map((d) => (
        <Circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={0.9} fill={WHITE} fillOpacity={d.o} />
      ))}
    </Svg>
  );
}

export function HeroCard() {
  useThemeRefresh();
  const router = useRouter();
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Full size on a 328 dp wide card (360 dp phone); a little smaller below that so the add bar clears the words.
  const fit = box.w ? Math.min(1, Math.max(0.78, (box.w - 150) / 178)) : 1;
  const scale = ART_SCALE * fit;
  const artLeft = box.w - ART_W * scale - ART_INSET;
  const artTop = box.h - ART_H * scale - ART_INSET;

  return (
    <Pressable
      onPress={() => router.push(HOME_TOOLS.newLabel.href as any)}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessibilityRole="button"
      accessibilityLabel="New label: start with a blank label, any size. Create label."
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {box.w ? (
        <HeroBackground w={box.w} h={box.h} glowX={artLeft + 110 * scale} glowY={artTop + 90 * scale} glowScale={scale} cyan={C.accent} />
      ) : null}
      <View style={styles.art}>
        <DesignArt scale={scale} cyan={C.accent} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.title}>
          New label
        </Text>
        <Text
          numberOfLines={3}
          maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
          style={[styles.detail, { marginRight: 170 * fit }]}>
          Start with a blank label, any size
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
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: 16,
    backgroundColor: BG_BOTTOM,
    ...cardElevation(c, scheme),
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  art: {
    position: 'absolute',
    right: ART_INSET,
    bottom: ART_INSET,
  },
  copy: {
    gap: 4,
  },
  title: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  detail: {
    color: WHITE,
    opacity: 0.72,
    fontSize: 13,
    lineHeight: 18,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: WHITE,
  },
  ctaText: {
    color: INK,
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.92,
  },
}));
