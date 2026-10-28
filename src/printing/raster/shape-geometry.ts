/**
 * Outline geometry for the curved print shapes (rounded rectangle, oval, circle), shared by the
 * Skia surface (path) and the dot-buffer surface (per-dot test) so both draw the same shape.
 */

export type ShapePaint = {
  kind: 'roundRect' | 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius in dots (roundRect only). Clamped to half the shorter side. */
  radius: number;
  /** Ring thickness in dots, or null to fill the whole shape. */
  stroke: number | null;
};

function clampRadius(radius: number, w: number, h: number): number {
  return Math.max(0, Math.min(radius, w / 2, h / 2));
}

/** True when the dot centre (px, py) is inside the shape's outer outline. */
export function insideShape(
  kind: ShapePaint['kind'],
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  px: number,
  py: number,
): boolean {
  if (w <= 0 || h <= 0) return false;
  if (kind === 'ellipse') {
    const nx = (px - (x + w / 2)) / (w / 2);
    const ny = (py - (y + h / 2)) / (h / 2);
    return nx * nx + ny * ny <= 1;
  }
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const r = clampRadius(radius, w, h);
  if (r === 0) return true;
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** True when the dot centre falls on the shape's ink (filled body, or just the ring). */
export function shapeCovers(s: ShapePaint, px: number, py: number): boolean {
  if (!insideShape(s.kind, s.x, s.y, s.w, s.h, s.radius, px, py)) return false;
  if (s.stroke == null) return true;
  const t = s.stroke;
  const iw = s.w - 2 * t;
  const ih = s.h - 2 * t;
  if (iw <= 0 || ih <= 0) return true;
  const innerR = s.kind === 'roundRect' ? Math.max(0, clampRadius(s.radius, s.w, s.h) - t) : 0;
  return !insideShape(s.kind, s.x + t, s.y + t, iw, ih, innerR, px, py);
}

/** SVG path for the shape outline (used for a Skia stroke or fill). */
export function shapeSvgPath(
  kind: ShapePaint['kind'],
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): string {
  if (kind === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  }
  const r = clampRadius(radius, w, h);
  if (r === 0) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}
