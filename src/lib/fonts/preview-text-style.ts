import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Expo registers each cut as its own family (`Inter_400Regular`, `Inter_600SemiBold`).
 * Setting `fontWeight` / `fontStyle` on those names is a no-op (or drops the face on
 * Android). Print swaps Inter→SemiBold and skews italic; preview must do the same.
 */

/** Regular face → heavier cut already in `APP_FONT_MAP`. */
const BOLD_FACE_BY_REGULAR: Readonly<Record<string, string>> = {
  Inter_400Regular: 'Inter_600SemiBold',
  Poppins_400Regular: 'Poppins_700Bold',
};

/** Faces that are already a bold/semibold cut — bold toggle needs no extra thickening. */
const ALREADY_BOLD_FACES = new Set<string>([
  'Inter_600SemiBold',
  'Poppins_700Bold',
  'Montserrat_600SemiBold',
  'PlayfairDisplay_700Bold',
  'Oswald_500Medium',
]);

/** Shear ≈ print `ITALIC_SKEW` (−0.2 → ~−11.3°). */
export const PREVIEW_ITALIC_SKEW_DEG = -11.3;

export type PreviewFontStyle = {
  fontFamily?: string;
  /** Only set for the system default face — custom cuts ignore weight. */
  fontWeight?: TextStyle['fontWeight'];
  /** True when we must fake weight (no bold sibling loaded). */
  syntheticBold: boolean;
};

export function resolvePreviewFontStyle(
  family: string | undefined,
  bold: boolean,
): PreviewFontStyle {
  if (!family) {
    return {
      fontFamily: undefined,
      fontWeight: bold ? '600' : '400',
      syntheticBold: false,
    };
  }
  if (!bold) {
    return { fontFamily: family, fontWeight: undefined, syntheticBold: false };
  }
  const boldFace = BOLD_FACE_BY_REGULAR[family];
  if (boldFace) {
    return { fontFamily: boldFace, fontWeight: undefined, syntheticBold: false };
  }
  if (ALREADY_BOLD_FACES.has(family)) {
    return { fontFamily: family, fontWeight: undefined, syntheticBold: false };
  }
  // Single-weight custom / Indic / downloaded face: keep the face, thicken with shadow.
  return { fontFamily: family, fontWeight: undefined, syntheticBold: true };
}

/** Same bold-face swap print uses for Inter (and Poppins when available). */
export function boldPrintFamily(family: string | undefined, bold?: boolean): string | undefined {
  if (!family || !bold) return family;
  return BOLD_FACE_BY_REGULAR[family] ?? family;
}

/**
 * Android drops `skewX` on Views (only translate/scale/rotate survive), but it synthesises
 * a slant for `fontStyle: 'italic'` on any face. iOS does the opposite, so it keeps the skew.
 */
export function previewFontStyle(italic: boolean | undefined): 'italic' | 'normal' {
  return italic && Platform.OS === 'android' ? 'italic' : 'normal';
}

export function previewItalicWrapStyle(italic: boolean | undefined): ViewStyle | null {
  if (!italic || Platform.OS === 'android') return null;
  return { transform: [{ skewX: `${PREVIEW_ITALIC_SKEW_DEG}deg` }] };
}

/** Horizontal smear that reads as bold when the TTF has no heavy cut. */
export function previewSyntheticBoldStyle(
  color: string,
  fontSizePx: number,
): TextStyle | null {
  const dx = Math.max(0.4, Math.min(1.2, fontSizePx * 0.045));
  return {
    textShadowColor: color,
    textShadowOffset: { width: dx, height: 0 },
    textShadowRadius: 0,
  };
}
