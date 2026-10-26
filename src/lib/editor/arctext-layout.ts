import { charWidthEm } from '@/lib/text-metrics';

export type ArcCharLayout = {
  char: string;
  x: number;
  y: number;
  rotationDeg: number;
};

export type ArcTextLayoutResult = {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  effectiveFontSizePx: number;
  /** Radius the glyph centres sit on, and the angles (rad, 0 = 3 o'clock, clockwise) the string spans. */
  baselineRadius: number;
  startAngle: number;
  endAngle: number;
  characters: ArcCharLayout[];
};

export type ComputeArcTextLayoutParams = {
  text: string;
  widthPx: number;
  heightPx: number;
  nominalFontSizePx: number;
  lineWidthMm?: number;
  scale?: number;
  bold?: boolean;
};

/** Leave a gap at 6 o'clock so the string never wraps onto itself. */
const MAX_ARC_SPAN_RAD = (320 * Math.PI) / 180;
/** Extra tracking so rotated glyphs do not kiss along the arc. */
const TRACKING_EM = 0.22;
/** Glyphs are centered on the path; keep height well inside the circle. */
const MAX_FONT_OVER_RADIUS = 0.24;

function baselineRadiusFor(radius: number, fontSize: number, strokeWidth: number): number {
  return Math.max(2, radius - fontSize * 0.52 - strokeWidth / 2 - 1);
}

function totalAngleFor(text: string, fontSize: number, baselineRadius: number, bold: boolean): number {
  const tracking = fontSize * TRACKING_EM;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const w = charWidthEm(text[i], bold) * fontSize * 1.12 + tracking;
    total += w / Math.max(2, baselineRadius);
  }
  return total;
}

function fontFits(text: string, fontSize: number, radius: number, strokeWidth: number, bold: boolean): boolean {
  if (fontSize > radius * MAX_FONT_OVER_RADIUS) return false;
  const baselineRadius = baselineRadiusFor(radius, fontSize, strokeWidth);
  if (baselineRadius < fontSize * 0.7) return false;
  return totalAngleFor(text, fontSize, baselineRadius, bold) <= MAX_ARC_SPAN_RAD;
}

/**
 * Computes polar vector coordinates and tangent rotations for text curved along
 * a circular arc with an inscribed circular guide line.
 * Font size is always reduced until characters cannot overlap, at any box size.
 */
export function computeArcTextLayout({
  text,
  widthPx,
  heightPx,
  nominalFontSizePx,
  lineWidthMm = 0.25,
  scale = 1,
  bold = false,
}: ComputeArcTextLayoutParams): ArcTextLayoutResult {
  const diameter = Math.min(widthPx, heightPx);
  const cx = widthPx / 2;
  const cy = heightPx / 2;
  const strokeWidth = Math.max(0.75, (lineWidthMm || 0.25) * scale);
  const radius = Math.max(2, (diameter - strokeWidth) / 2 - 1);
  const minFont = 1;

  if (!text || text.length === 0 || radius <= 4) {
    return {
      cx,
      cy,
      radius,
      strokeWidth,
      effectiveFontSizePx: Math.max(minFont, Math.min(nominalFontSizePx, radius * MAX_FONT_OVER_RADIUS)),
      baselineRadius: radius,
      startAngle: -Math.PI / 2,
      endAngle: -Math.PI / 2,
      characters: [],
    };
  }

  let hi = Math.min(nominalFontSizePx, radius * MAX_FONT_OVER_RADIUS);
  let lo = minFont;
  if (!fontFits(text, hi, radius, strokeWidth, bold)) {
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (fontFits(text, mid, radius, strokeWidth, bold)) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }

  const effectiveFontSizePx = Math.max(minFont, hi);
  const baselineRadius = baselineRadiusFor(radius, effectiveFontSizePx, strokeWidth);
  const totalAngle = totalAngleFor(text, effectiveFontSizePx, baselineRadius, bold);
  const tracking = effectiveFontSizePx * TRACKING_EM;

  const startAngle = -Math.PI / 2 - totalAngle / 2;
  let currentAngle = startAngle;
  const characters: ArcCharLayout[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charWidth = charWidthEm(char, bold) * effectiveFontSizePx * 1.12 + tracking;
    const deltaAngle = charWidth / baselineRadius;
    const midAngle = currentAngle + deltaAngle / 2;

    characters.push({
      char,
      x: cx + baselineRadius * Math.cos(midAngle),
      y: cy + baselineRadius * Math.sin(midAngle),
      rotationDeg: (midAngle * 180) / Math.PI + 90,
    });

    currentAngle += deltaAngle;
  }

  return {
    cx,
    cy,
    radius,
    strokeWidth,
    effectiveFontSizePx,
    baselineRadius,
    startAngle,
    endAngle: currentAngle,
    characters,
  };
}
