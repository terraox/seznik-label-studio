import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { C, themedStyles, useThemeRefresh } from '@/theme';

// theme-fixed: like the home hero, this is the same navy card in light and dark.
const WHITE = '#FFFFFF';
const INK = '#24275A';
const CYAN = '#2DAFE5';
const BG_TOP = '#2D3178';
const BG_BOTTOM = '#181A45';

const STEPS = ['Choose platform', 'Upload PDF', 'Preview & print'];

/** A shipping label with its crop corners: what this tool cuts out of the seller's PDF. */
function LabelArt() {
  const bars = [0, 3, 5, 9, 11, 14, 18, 20, 23, 27, 29, 32, 36, 38, 41];
  return (
    <Svg width={92} height={104} viewBox="0 0 92 104" accessibilityElementsHidden importantForAccessibility="no">
      <G rotation={6} origin="46, 52">
        <Rect x={9} y={9} width={74} height={90} rx={7} fill="#05061F" fillOpacity={0.18} />
        <Rect x={8} y={4} width={74} height={90} rx={7} fill={WHITE} />
        <Rect x={16} y={12} width={30} height={7} rx={2} fill={INK} />
        <Rect x={16} y={24} width={58} height={3} rx={1.5} fill={INK} fillOpacity={0.18} />
        <Rect x={16} y={31} width={44} height={3} rx={1.5} fill={INK} fillOpacity={0.18} />
        <Rect x={16} y={42} width={58} height={1} fill={INK} fillOpacity={0.15} />
        {bars.map((dx, i) => (
          <Rect key={dx} x={17 + dx * 1.3} y={50} width={i % 3 === 0 ? 2.6 : 1.4} height={28} fill={INK} />
        ))}
        <Rect x={16} y={83} width={36} height={3} rx={1.5} fill={INK} fillOpacity={0.3} />
      </G>
      <G stroke={CYAN} strokeWidth={2.4} strokeLinecap="round" fill="none">
        <Path d="M2 14V4a2 2 0 0 1 2-2h10" />
        <Path d="M90 90v10a2 2 0 0 1-2 2H78" />
      </G>
    </Svg>
  );
}

/** Top of the shipping-label screen: what the tool does, and the three steps with the first one lit. */
export function PlatformHero() {
  useThemeRefresh();
  return (
    <View style={styles.card}>
      <Svg width="100%" height="100%" style={styles.fill} accessibilityElementsHidden importantForAccessibility="no">
        <Defs>
          <LinearGradient id="plBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BG_TOP} />
            <Stop offset="1" stopColor={BG_BOTTOM} />
          </LinearGradient>
          <RadialGradient id="plGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={CYAN} stopOpacity={0.4} />
            <Stop offset="1" stopColor={CYAN} stopOpacity={0} />
          </RadialGradient>
          <Pattern id="plDots" width={11} height={11} patternUnits="userSpaceOnUse">
            <Circle cx={2} cy={2} r={1} fill={WHITE} fillOpacity={0.16} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#plBg)" />
        <Rect x="42%" width="58%" height="100%" fill="url(#plDots)" />
        <Rect x="48%" y="-10%" width="60%" height="90%" fill="url(#plGlow)" />
      </Svg>

      <View style={styles.top}>
        <View style={styles.copy}>
          <View style={styles.pill}>
            <Ionicons name="cube-outline" size={12} color={WHITE} />
            <Text style={styles.pillText}>SHIPPING LABELS</Text>
          </View>
          <Text style={styles.title}>Print marketplace labels</Text>
          <Text style={styles.sub}>Auto-crop the label from your seller PDF and print it on your roll.</Text>
        </View>
        <View style={styles.art}>
          <LabelArt />
        </View>
      </View>

    </View>
  );
}

/** The three steps as a connected row; the current one is filled, the rest are outlined. */
export function PlatformSteps({ current = 0 }: { current?: number }) {
  useThemeRefresh();
  return (
    <View style={styles.stepper}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.stepCol}>
          <View style={styles.stepTrack}>
            <View style={[styles.stepLine, i === 0 && styles.stepLineHidden, i <= current && styles.stepLineOn]} />
            <View style={[styles.stepDot, i <= current && styles.stepDotOn]}>
              <Text style={[styles.stepNum, i <= current && styles.stepNumOn]}>{i + 1}</Text>
            </View>
            <View style={[styles.stepLine, i === STEPS.length - 1 && styles.stepLineHidden, i < current && styles.stepLineOn]} />
          </View>
          <Text style={[styles.stepText, i === current && styles.stepTextOn]} numberOfLines={2}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles((c) => ({
  card: { borderRadius: 20, overflow: 'hidden', padding: 14, gap: 12, backgroundColor: BG_BOTTOM },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 175, 229, 0.28)',
  },
  pillText: { flexShrink: 1, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: WHITE },
  title: { fontSize: 19, fontWeight: '800', color: WHITE },
  sub: { fontSize: 12.5, lineHeight: 17, color: 'rgba(255, 255, 255, 0.78)' },
  art: { width: 92, height: 104, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row' },
  stepCol: { flex: 1, alignItems: 'center', gap: 6 },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 2, backgroundColor: c.hairline },
  stepLineOn: { backgroundColor: c.accentFill },
  stepLineHidden: { opacity: 0 },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: c.accentFill, borderColor: c.accentFill },
  stepNum: { fontSize: 14, fontWeight: '800', color: c.textMuted },
  stepNumOn: { color: c.onAccent },
  stepText: { fontSize: 13, fontWeight: '600', color: c.textMuted, textAlign: 'center' },
  stepTextOn: { fontWeight: '800', color: c.text },
}));
