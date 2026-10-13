/** Per-element multiplier on a vector sticker's native stroke width (1 = as drawn). */
export const STROKE_SCALE_MIN = 0.5;
export const STROKE_SCALE_MAX = 3;
export const STROKE_SCALE_STEP = 0.25;

export function clampStrokeScale(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(STROKE_SCALE_MAX, Math.max(STROKE_SCALE_MIN, value));
}

/** Rewrites every stroke-width in an SVG string. Used by the React Native preview renderer. */
export function scaleSvgStrokes(svg: string, scale: number): string {
  const k = clampStrokeScale(scale);
  if (k === 1) return svg;
  return svg.replace(/stroke-width="([\d.]+)"/g, (_m, w: string) => `stroke-width="${(Number(w) * k).toFixed(3)}"`);
}
