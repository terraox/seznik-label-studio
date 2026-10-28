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

/** Faces that are already a bold/semibold cut: there is no heavier cut to swap to, so the bold toggle thickens them. */
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
    return { fontFamily: family, fontWeight: undefined, syntheticBold: true };
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
 * Never set `fontStyle: 'italic'` on a named expo face: Android has no italic cut registered for it
 * and swaps to the phone's own font. iOS slants with a wrapper skew (see previewItalicWrapStyle).
 * Android drops `skewX` on Views, so its preview keeps the face upright; print still slants it.
 */
export function previewFontStyle(_italic: boolean | undefined): 'italic' | 'normal' {
  return 'normal';
}

export function previewItalicWrapStyle(italic: boolean | undefined): ViewStyle | null {
  if (!italic || Platform.OS === 'android') return null;
  return { transform: [{ skewX: `${PREVIEW_ITALIC_SKEW_DEG}deg` }] };
}

/**
 * Horizontal smear that reads as bold when the TTF has no heavy cut.
 * Android clears the shadow when its radius is exactly 0, so the smear never drew there; a tiny
 * radius keeps it sharp but present.
 */
export function previewSyntheticBoldStyle(
  color: string,
  fontSizePx: number,
): TextStyle | null {
  const dx = Math.max(0.6, Math.min(1.6, fontSizePx * 0.06));
  return {
    textShadowColor: color,
    textShadowOffset: { width: dx, height: 0 },
    textShadowRadius: 0.1,
  };
}
