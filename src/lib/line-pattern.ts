/**
 * One geometry for every line style, shared by the canvas preview, the SVG preview, the style
 * swatches and the print rasteriser, so what you see is what prints. Everything is plain
 * rectangles; diagonals and curves are built from thin slices.
 */

export const LINE_STYLE_IDS = [
  'solid',
  'dashed',
  'dotted',
  'dashdot',
  'double',
  'slash',
  'backslash',
  'zigzag',
  'wave',
] as const;

export type LinePatternStyle = (typeof LINE_STYLE_IDS)[number];

export type PatternRect = { x: number; y: number; w: number; h: number };

/** Styles that draw inside the box height (not just a bar), so they need some height to read. */
export const TALL_LINE_STYLES: readonly string[] = ['double', 'slash', 'backslash', 'zigzag', 'wave'];

/** Smallest box height (mm) at which a tall style is clearly visible. */
export function minHeightMmForLineStyle(style: string): number {
  if (style === 'double') return 1.5;
  return TALL_LINE_STYLES.includes(style) ? 2 : 0;
}

/** Styles whose repeat length follows the Virtual Interval setting. */
export function lineStyleUsesInterval(style: string): boolean {
  return style !== 'solid' && style !== 'double';
}

const MAX_SLICES = 3000;

/** Slices of a centre line y(x) over [x0, x1], each tall enough to join its neighbour. */
function slicePath(
  out: PatternRect[],
  x0: number,
  x1: number,
  step: number,
  stroke: number,
  yAt: (x: number) => number,
): void {
  for (let x = x0; x < x1 - 1e-9; x += step) {
    const w = Math.min(step, x1 - x);
    const y = yAt(x + w / 2);
    const yNext = yAt(Math.min(x1, x + w) + w / 2);
    const top = Math.min(y, yNext) - stroke / 2;
    const bottom = Math.max(y, yNext) + stroke / 2;
    out.push({ x, y: top, w, h: bottom - top });
  }
}

/**
 * Rectangles for a horizontal line of `length` x `height` (any unit).
 * `interval` is the dash length / repeat unit, `minStroke` the thinnest mark (1 dot or 1 px),
 * `step` the slice width for diagonals and curves.
 */
export function linePatternRects(
  style: string,
  length: number,
  height: number,
  interval: number,
  minStroke = 1,
  step = 1,
): PatternRect[] {
  const L = Math.max(0, length);
  const H = Math.max(minStroke, height);
  if (L <= 0) return [];
  const gap = Math.max(minStroke, interval);
  const out: PatternRect[] = [];

  const runs = (cycle: { len: number; on: boolean }[]) => {
    let x = 0;
    for (let i = 0; x < L && out.length < MAX_SLICES; i = (i + 1) % cycle.length) {
      const { len, on } = cycle[i];
      const w = Math.min(len, L - x);
      if (on && w > 0) out.push({ x, y: 0, w, h: H });
      x += len;
    }
  };

  switch (style) {
    case 'dashed':
      runs([{ len: gap, on: true }, { len: gap, on: false }]);
      return out;
    case 'dotted': {
      const dot = H;
      runs([{ len: dot, on: true }, { len: Math.max(dot, gap * 0.5), on: false }]);
      return out;
    }
    case 'dashdot': {
      const dot = Math.max(minStroke, H);
      runs([
        { len: gap * 2, on: true },
        { len: gap, on: false },
        { len: dot, on: true },
        { len: gap, on: false },
      ]);
      return out;
    }
    case 'double': {
      const bar = Math.max(minStroke, H / 3);
      out.push({ x: 0, y: 0, w: L, h: bar });
      out.push({ x: 0, y: Math.max(bar, H - bar), w: L, h: bar });
      return out;
    }
    case 'slash':
    case 'backslash': {
      const s = Math.max(minStroke, H / 4);
      const pitch = gap * 2;
      const span = pitch * 0.6;
      const lo = s / 2;
      const hi = Math.max(lo, H - s / 2);
      const stepUse = Math.max(step, (L / pitch) * (span / step) > MAX_SLICES ? span / 6 : step);
      for (let x = 0; x < L && out.length < MAX_SLICES; x += pitch) {
        const x1 = Math.min(L, x + span);
        const rising = style === 'slash';
        slicePath(out, x, x1, stepUse, s, (px) => {
          const t = span > 0 ? Math.min(1, Math.max(0, (px - x) / span)) : 0;
          return rising ? hi - t * (hi - lo) : lo + t * (hi - lo);
        });
      }
      return out;
    }
    case 'zigzag':
    case 'wave': {
      const s = Math.max(minStroke, H / 4);
      const lo = s / 2;
      const hi = Math.max(lo, H - s / 2);
      const mid = (lo + hi) / 2;
      const amp = (hi - lo) / 2;
      const half = gap;
      const stepUse = Math.max(step, L / MAX_SLICES);
      slicePath(out, 0, L, stepUse, s, (px) => {
        if (style === 'zigzag') {
          const phase = (px / half) % 2;
          const tri = phase <= 1 ? phase : 2 - phase; // 0..1..0
          return hi - tri * (hi - lo);
        }
        return mid - Math.sin((px / (half * 2)) * Math.PI * 2) * amp;
      });
      return out;
    }
    default:
      return [{ x: 0, y: 0, w: L, h: H }];
  }
}

/**
 * Rectangles for a line drawn in a boxW x boxH box. A box at least twice as tall as wide is a
 * vertical line, drawn by turning the horizontal pattern a quarter turn.
 */
export function linePatternForBox(
  style: string,
  boxW: number,
  boxH: number,
  interval: number,
  minStroke = 1,
  step = 1,
): PatternRect[] {
  const vertical = boxH >= boxW * 2;
  if (!vertical) return linePatternRects(style, boxW, boxH, interval, minStroke, step);
  return linePatternRects(style, boxH, boxW, interval, minStroke, step).map((r) => ({
    x: r.y,
    y: r.x,
    w: r.h,
    h: r.w,
  }));
}
