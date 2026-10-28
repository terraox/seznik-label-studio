import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { C, themedStyles, useThemeRefresh } from '@/theme';

// theme-fixed: same navy card as the home hero, in light and dark.
const WHITE = '#FFFFFF';
const INK = '#24275A';
const CYAN = '#2DAFE5';
const BG_TOP = '#2D3178';
const BG_BOTTOM = '#181A45';

const STEPS = ['Upload photo', 'Set the size', 'Edit & print'];

/** A photo of a label, framed by scan corners, with the true size marked on it. */
function PhotoArt() {
  return (
    <Svg width={96} height={104} viewBox="0 0 96 104" accessibilityElementsHidden importantForAccessibility="no">
      <G rotation={-5} origin="48, 52">
        <Rect x={11} y={11} width={74} height={84} rx={8} fill="#05061F" fillOpacity={0.2} />
        <Rect x={9} y={7} width={74} height={84} rx={8} fill={WHITE} />
        <Rect x={15} y={13} width={62} height={44} rx={4} fill={CYAN} fillOpacity={0.18} />
        <Circle cx={30} cy={27} r={6} fill={CYAN} fillOpacity={0.7} />
        <Path d="M15 57 L36 36 L50 48 L62 38 L77 54 V57 Z" fill={INK} fillOpacity={0.55} />
        <Rect x={15} y={64} width={36} height={5} rx={2} fill={INK} />
        <Rect x={15} y={73} width={54} height={3} rx={1.5} fill={INK} fillOpacity={0.2} />
        <Rect x={15} y={80} width={40} height={3} rx={1.5} fill={INK} fillOpacity={0.2} />
      </G>
      <G stroke={CYAN} strokeWidth={2.4} strokeLinecap="round" fill="none">
        <Path d="M3 16V6a3 3 0 0 1 3-3h10" />
        <Path d="M93 88v10a3 3 0 0 1-3 3H80" />
      </G>
    </Svg>
  );
}

/** Top of the Upload label page: what it does, in the same navy card as the other tool heroes. */
export function UploadHero() {
  useThemeRefresh();
  return (
    <View style={styles.card}>
      <Svg width="100%" height="100%" style={styles.fill} accessibilityElementsHidden importantForAccessibility="no">
        <Defs>
          <LinearGradient id="ulBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BG_TOP} />
            <Stop offset="1" stopColor={BG_BOTTOM} />
          </LinearGradient>
          <RadialGradient id="ulGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={CYAN} stopOpacity={0.4} />
            <Stop offset="1" stopColor={CYAN} stopOpacity={0} />
          </RadialGradient>
          <Pattern id="ulDots" width={11} height={11} patternUnits="userSpaceOnUse">
            <Circle cx={2} cy={2} r={1} fill={WHITE} fillOpacity={0.16} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ulBg)" />
        <Rect x="42%" width="58%" height="100%" fill="url(#ulDots)" />
        <Rect x="48%" y="-10%" width="60%" height="90%" fill="url(#ulGlow)" />
      </Svg>

      <View style={styles.copy}>
        <View style={styles.pill}>
          <Ionicons name="cloud-upload-outline" size={12} color={WHITE} />
          <Text style={styles.pillText}>UPLOAD LABEL</Text>
        </View>
        <Text style={styles.title}>Turn a photo into a label</Text>
        <Text style={styles.sub}>
          Upload a soft copy of a label, set its real size, then trace or print it.
        </Text>
      </View>
      <View style={styles.art}>
        <PhotoArt />
      </View>
    </View>
  );
}

/** The three steps as a connected row; steps up to `current` are filled. */
export function UploadSteps({ current = 0 }: { current?: number }) {
  useThemeRefresh();
  return (
    <View style={styles.stepper}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.stepCol}>
          <View style={styles.stepTrack}>
            <View style={[styles.stepLine, i === 0 && styles.stepLineHidden, i <= current && styles.stepLineOn]} />
            <View style={[styles.stepDot, i <= current && styles.stepDotOn]}>
              {i < current ? (
                <Ionicons name="checkmark" size={16} color={C.onAccent} />
              ) : (
                <Text style={[styles.stepNum, i <= current && styles.stepNumOn]}>{i + 1}</Text>
              )}
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 16,
    backgroundColor: BG_BOTTOM,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  copy: { flex: 1, minWidth: 0, gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 175, 229, 0.28)', // theme-fixed: tint on the navy card
  },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: WHITE },
  title: { fontSize: 20, fontWeight: '800', color: WHITE, lineHeight: 25 },
  sub: { fontSize: 13, lineHeight: 18, color: 'rgba(255, 255, 255, 0.78)' }, // theme-fixed: on the navy card
  art: { width: 96, height: 104, alignItems: 'center', justifyContent: 'center' },
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
