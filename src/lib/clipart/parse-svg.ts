export type ClipartDrawOp =
  | { t: 'path'; d: string; fill: boolean; sw: number }
  | { t: 'circle'; x: number; y: number; r: number; fill: boolean; sw: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: boolean; sw: number }
  | { t: 'ellipse'; x: number; y: number; rx: number; ry: number; fill: boolean; sw: number }
  | { t: 'line'; a: number; b: number; c: number; d: number; sw: number }
  | { t: 'polygon'; pts: string; fill: boolean; sw: number };

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

function num(tag: string, name: string, fallback = 0): number {
  const raw = attr(tag, name);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function isFilled(tag: string): boolean {
  const fill = attr(tag, 'fill');
  if (fill === 'none') return false;
  if (fill && fill !== 'none') return true;
  return /fill="currentColor"/.test(tag) && !/stroke="currentColor"/.test(tag);
}

function strokeWidth(tag: string): number {
  return num(tag, 'stroke-width', 1.6);
}

/** Enough of SVG for built-in stickers and simple user uploads. */
export function parseSvgDrawOps(svg: string): ClipartDrawOp[] {
  const ops: ClipartDrawOp[] = [];
  const tags = svg.match(/<(path|circle|rect|ellipse|line|polygon)\b[^>]*\/?>/gi) ?? [];
  for (const tag of tags) {
    const type = tag.match(/^<(\w+)/)?.[1]?.toLowerCase();
    const fill = isFilled(tag);
    const sw = strokeWidth(tag);
    if (type === 'path') {
      const d = attr(tag, 'd');
      if (d) ops.push({ t: 'path', d, fill, sw });
    } else if (type === 'circle') {
      ops.push({ t: 'circle', x: num(tag, 'cx'), y: num(tag, 'cy'), r: num(tag, 'r'), fill, sw });
    } else if (type === 'rect') {
      ops.push({
        t: 'rect',
        x: num(tag, 'x'),
        y: num(tag, 'y'),
        w: num(tag, 'width'),
        h: num(tag, 'height'),
        rx: num(tag, 'rx'),
        fill,
        sw,
      });
    } else if (type === 'ellipse') {
      ops.push({
        t: 'ellipse',
        x: num(tag, 'cx'),
        y: num(tag, 'cy'),
        rx: num(tag, 'rx'),
        ry: num(tag, 'ry'),
        fill,
        sw,
      });
    } else if (type === 'line') {
      ops.push({
        t: 'line',
        a: num(tag, 'x1'),
        b: num(tag, 'y1'),
        c: num(tag, 'x2'),
        d: num(tag, 'y2'),
        sw,
      });
    } else if (type === 'polygon') {
      const pts = attr(tag, 'points');
      if (pts) ops.push({ t: 'polygon', pts, fill, sw });
    }
  }
  return ops;
}

export function sanitizeUserSvg(raw: string): string | null {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text || text.length > 180_000) return null;
  if (!/<svg[\s>]/i.test(text)) return null;
  if (/<script|<foreignObject|<iframe|javascript:/i.test(text)) return null;
  return text;
}
