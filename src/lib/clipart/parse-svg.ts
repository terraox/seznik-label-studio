export type ClipartDrawOp =
  | { t: 'path'; d: string; fill: boolean; sw: number }
  | { t: 'circle'; x: number; y: number; r: number; fill: boolean; sw: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: boolean; sw: number }
  | { t: 'ellipse'; x: number; y: number; rx: number; ry: number; fill: boolean; sw: number }
  | { t: 'line'; a: number; b: number; c: number; d: number; sw: number }
  | { t: 'polygon'; pts: string; fill: boolean; sw: number };

/** Any draw op as one SVG path string (so a renderer only needs a path API). */
export function clipartOpToSvgPath(op: ClipartDrawOp): string | null {
  switch (op.t) {
    case 'path':
      return op.d;
    case 'circle':
      return `M${op.x - op.r} ${op.y}a${op.r} ${op.r} 0 1 0 ${op.r * 2} 0a${op.r} ${op.r} 0 1 0 ${-op.r * 2} 0Z`;
    case 'ellipse':
      return `M${op.x - op.rx} ${op.y}a${op.rx} ${op.ry} 0 1 0 ${op.rx * 2} 0a${op.rx} ${op.ry} 0 1 0 ${-op.rx * 2} 0Z`;
    case 'line':
      return `M${op.a} ${op.b}L${op.c} ${op.d}`;
    case 'polygon':
      return `M${op.pts.trim().replace(/\s+/g, ' L')}Z`;
    case 'rect': {
      const rx = Math.max(0, Math.min(op.rx, op.w / 2, op.h / 2));
      if (rx <= 0) return `M${op.x} ${op.y}h${op.w}v${op.h}h${-op.w}Z`;
      const { x, y, w, h } = op;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${rx} 0 0 1 ${x + w} ${y + rx}V${y + h - rx}A${rx} ${rx} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${rx} 0 0 1 ${x} ${y + h - rx}V${y + rx}A${rx} ${rx} 0 0 1 ${x + rx} ${y}Z`;
    }
    default:
      return null;
  }
}

/**
 * Skia's SVG path parser misreads arc flags that are glued to the next number
 * (`a4.5 4.5 0 018-2.8` is flags 0,1 and dx 8, not x=18). The canvas SVG
 * renderer follows the SVG spec. Re-emit arcs with the flags separated so the
 * printed curve lands on the same point as the canvas.
 */
export function separateSvgArcFlags(d: string): string {
  let i = 0;
  let out = '';
  const len = d.length;

  const isCmd = (c: string) => /[a-zA-Z]/.test(c);

  function skipSep() {
    while (i < len && (d[i] === ' ' || d[i] === ',' || d[i] === '\n' || d[i] === '\t' || d[i] === '\r')) i++;
  }

  function readNumber(): string | null {
    skipSep();
    if (i >= len) return null;
    const start = i;
    if (d[i] === '+' || d[i] === '-') i++;
    let saw = false;
    while (i < len && d[i]! >= '0' && d[i]! <= '9') {
      saw = true;
      i++;
    }
    if (i < len && d[i] === '.') {
      i++;
      while (i < len && d[i]! >= '0' && d[i]! <= '9') {
        saw = true;
        i++;
      }
    }
    if (!saw) {
      i = start;
      return null;
    }
    if (i < len && (d[i] === 'e' || d[i] === 'E')) {
      const mark = i;
      i++;
      if (i < len && (d[i] === '+' || d[i] === '-')) i++;
      const exp = i;
      while (i < len && d[i]! >= '0' && d[i]! <= '9') i++;
      if (i === exp) i = mark;
    }
    return d.slice(start, i);
  }

  function readFlag(): string | null {
    skipSep();
    if (i < len && (d[i] === '0' || d[i] === '1')) {
      const flag = d[i]!;
      i++;
      return flag;
    }
    return null;
  }

  while (i < len) {
    skipSep();
    if (i >= len) break;
    const cmd = d[i]!;
    if (!isCmd(cmd)) {
      const n = readNumber();
      if (n == null) break;
      out += ` ${n}`;
      continue;
    }
    i++;
    out += `${out ? ' ' : ''}${cmd}`;
    if (cmd === 'z' || cmd === 'Z') continue;
    const arc = cmd === 'a' || cmd === 'A';
    while (i < len) {
      skipSep();
      if (i >= len || isCmd(d[i]!)) break;
      if (!arc) {
        const n = readNumber();
        if (n == null) break;
        out += ` ${n}`;
        continue;
      }
      const rx = readNumber();
      const ry = readNumber();
      const rot = readNumber();
      const large = readFlag();
      const sweep = readFlag();
      const px = readNumber();
      const py = readNumber();
      if (rx == null || ry == null || rot == null || large == null || sweep == null || px == null || py == null) {
        break;
      }
      out += ` ${rx} ${ry} ${rot} ${large} ${sweep} ${px} ${py}`;
    }
  }
  return out;
}

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
