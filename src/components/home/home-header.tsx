import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { StatusChip } from '@/components/home/status-chip';
import { LOGO_BLUE, LOGO_CYAN, LOGO_NAVY, LOGO_SWOOSH } from '@/components/home/tool-art';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { Spacing } from '@/constants/theme';
import { HomeLayout } from '@/constants/ui';
import { themedStyles, useThemeRefresh } from '@/theme';

// theme-fixed: the header is the same navy band in light and dark; everything on it is drawn for that.
const SKY = '#7CCBF0';
const BG_TOP = '#2D3178';
const BG_BOTTOM = '#181A45';
const WHITE = '#FFFFFF';

/** The swoosh path's own box. */
const SWOOSH_W = 28.3;
const SWOOSH_H = 24;

/** Navy gradient (same as the hero card), a cyan glow in the top-right and a faint logo swoosh. */
function HeaderBackdrop({ w, h }: { w: number; h: number }) {
  const swooshScale = (h * 1.35) / SWOOSH_H;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id="hdr-bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BG_TOP} />
          <Stop offset="1" stopColor={BG_BOTTOM} />
        </LinearGradient>
        <RadialGradient id="hdr-glow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={LOGO_CYAN} stopOpacity={0.32} />
          <Stop offset="1" stopColor={LOGO_CYAN} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#hdr-bg)" />
      <Circle cx={w * 0.88} cy={h * 0.15} r={h * 1.1} fill="url(#hdr-glow)" />
      <Path
        d={LOGO_SWOOSH}
        fill={WHITE}
        fillOpacity={0.05}
        transform={`translate(${w * 0.38} ${-h * 0.2}) scale(${swooshScale})`}
      />
    </Svg>
  );
}

/** The logo swoosh on a white circle, like the app icon. */
function BrandBadge() {
  return (
    <View style={styles.badge}>
      <Svg width={31} height={26} viewBox={`0 0 ${SWOOSH_W} ${SWOOSH_H}`} accessibilityElementsHidden importantForAccessibility="no">
        <Defs>
          <LinearGradient id="hdr-swoosh" x1="0.3" y1="0" x2="0.7" y2="1">
            <Stop offset="0" stopColor={LOGO_CYAN} />
            <Stop offset="0.55" stopColor={LOGO_BLUE} />
            <Stop offset="1" stopColor={LOGO_NAVY} />
          </LinearGradient>
        </Defs>
        <Path d={LOGO_SWOOSH} fill="url(#hdr-swoosh)" />
      </Svg>
    </View>
  );
}

export function HomeHeader() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  return (
    <View onLayout={onLayout} style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      {size.w > 0 ? <HeaderBackdrop w={size.w} h={size.h} /> : null}
      <View style={styles.brand}>
        <BrandBadge />
        <View style={styles.lockup}>
          <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.wordmark}>
            SEZNIK
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.sub}>
            LABEL STUDIO
          </Text>
        </View>
      </View>
      <WalkthroughTarget id="home.printer" style={styles.chipSlot}>
        <StatusChip />
      </WalkthroughTarget>
    </View>
  );
}

const styles = themedStyles((c) => ({
  header: {
    backgroundColor: c.header,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: HomeLayout.screenPad,
    paddingBottom: Spacing.three + 2,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  // The name keeps its full width; on a narrow phone the printer chip gives way, not the name.
  brand: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  chipSlot: { flexShrink: 1, minWidth: 0, alignItems: 'flex-end' },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: { flexShrink: 0, justifyContent: 'center' },
  wordmark: {
    color: c.onHeader,
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1.6,
    // The slanted last letter overhangs its box; a little room keeps it from being clipped.
    paddingRight: 4,
    includeFontPadding: false,
  },
  sub: { color: SKY, fontSize: 11.5, lineHeight: 15, fontWeight: '700', letterSpacing: 1.9, includeFontPadding: false },
}));
