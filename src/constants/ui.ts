import { Platform } from 'react-native';

export const Palette = {
  header: '#24275A',
  screen: '#F4F7FB',
  card: '#FFFFFF',
  cardTop: '#EEF2F8',
  accent: '#2DAFE5',
  danger: '#C8493F',
  ink: '#1D2140',
  muted: '#666C88',
  actionText: '#4A5070',
  preview: '#FAD5DF',
  hairline: '#E4E9F1',
  disabled: '#A8ADC0',
} as const;

/** Filled hero surface; white text on it stays above 4.5:1 (Palette.accent is ~2.9:1). */
export const accentStrong = '#1878B8';

/**
 * Solid status-chip fills (white text on each). Contrast vs #FFFFFF is ≥4.5:1.
 * `idle` is the red "not connected" fill (WePrint / old home pill). `busy` is
 * amber for scanning/connecting. `ok` is green when connected or printing.
 */
export const HomeStatusColors = {
  idle: '#DC2626',
  busy: '#B45309',
  ok: '#18794A',
  error: '#DC2626',
} as const;

export const HomeLayout = {
  screenPad: 16,
  /** Horizontal gap between tiles in a row. */
  gap: 10,
  /** Vertical gap between major sections. */
  sectionGap: 16,
  /** Top padding inside the home ScrollView content. */
  contentPadTop: 16,
  gridColumns: 3,
  labelTypeColumns: 4,
  /** New Label hero — WePrint-style broad card with left art. */
  heroHeight: 96,
  /** 3-column tile min height (Print from file, More ways to create): art, title and hint. */
  tileHeight: 108,
  /** Drawn tool art on those tiles (tool-art.tsx). */
  tileArtSize: 46,
  /** 4-column Label types tile min height. */
  labelTypeTileHeight: 72,
  /** Section heading text line (~13) + space below heading. */
  sectionHeadingBlock: 24,
  sectionHeadingGap: 6,
  iconSize: 22,
  chipHeight: 44,
  /** Last-edited card preview stage height (HiFi catalog paint). */
  continuePreviewMaxHeight: 200,
  /** Buy from us marquee strip. */
  buyStripHeight: 250,
  labelMaxFontScale: 1.4,
} as const;

/**
 * Content height budget at default font scale (exclude tab-bar padding).
 * Assumed viewport for content: ~360×740 phone → ~560dp below header/above tabs.
 * With current-template card + Buy from us strip the home screen scrolls.
 */
export const HOME_CONTENT_BUDGET = {
  assumedViewportHeight: 560,
  withContinue: 700,
  withoutContinue: 520,
} as const;

export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#1A1F3D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  android: { elevation: 2 },
  default: {},
});

/** Android-only ripple; omit on iOS so Pressable keeps opacity feedback.
 * Do not set `foreground: true` — it crashes inside overflow-hidden cards on Android. */
export const androidRipple =
  Platform.OS === 'android' ? { color: 'rgba(45, 175, 229, 0.16)' as const } : undefined;

/**
 * Clamp a base size against the device width so layouts stay readable on
 * small phones and don't blow up on tablets. 390 is the iPhone reference width.
 */
export function scaleFont(width: number, size: number, min = 0.85, max = 1.15) {
  const factor = Math.min(Math.max(width / 390, min), max);
  return Math.round(size * factor);
}

/** Typography tuned to match reference screenshots — small, regular weight. */
export const Type = {
  badge: { fontSize: 13, fontWeight: '500' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  chip: { fontSize: 12, fontWeight: '400' as const },
  action: { fontSize: 12, fontWeight: '400' as const },
  button: { fontSize: 16, fontWeight: '500' as const },
  modalTitle: { fontSize: 14, fontWeight: '400' as const },
  modalAction: { fontSize: 17, fontWeight: '500' as const },
} as const;
