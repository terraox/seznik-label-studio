import type { BorderStyleId } from '@/constants/border-library';

/** Axis-aligned ink rectangle in integer units (printer dots or physical screen pixels). */
export type FrameBand = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Outline the border follows: the label's die-cut. */
export type BorderShape = 'rect' | 'circle' | 'ellipse';

export function borderShapeForMedia(mediaShape: string | null | undefined): BorderShape {
  if (mediaShape === 'circle') return 'circle';
  if (mediaShape === 'ellipse') return 'ellipse';
  return 'rect';
}

export function solidFrameBands(x: number, y: number, w: number, h: number, stroke: number): FrameBand[] {
  const t = Math.max(1, Math.round(stroke));
  return [
    { left: x, top: y, width: w, height: t },
    { left: x, top: y + h - t, width: w, height: t },
    { left: x, top: y, width: t, height: h },
    { left: x + w - t, top: y, width: t, height: h },
  ];
}

export function dashedFrameBands(
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: number,
  dotted: boolean,
): FrameBand[] {
  const t = Math.max(1, Math.round(stroke));
  const dash = dotted ? t : t * 3;
  const gap = dotted ? t * 1.5 : t * 2;
  const bands: FrameBand[] = [];

  const paintDash = (x0: number, y0: number, len: number, vertical: boolean) => {
    let pos = 0;
    while (pos < len) {
      const seg = Math.min(dash, len - pos);
      if (vertical) {
        bands.push({ left: x0, top: y0 + pos, width: t, height: seg });
      } else {
        bands.push({ left: x0 + pos, top: y0, width: seg, height: t });
      }
      pos += dash + gap;
    }
  };

  paintDash(x, y, w, false);
  paintDash(x, y + h - t, w, false);
  paintDash(x, y, h, true);
  paintDash(x + w - t, y, h, true);
  return bands;
}

/** Inset frames: outer line, then thin inner line(s) `gap` apart. */
function nestedFrameBands(
  x: number,
  y: number,
  w: number,
  h: number,
  lines: { offset: number; stroke: number }[],
): FrameBand[] {
  const bands: FrameBand[] = [];
  for (const line of lines) {
    const iw = w - line.offset * 2;
    const ih = h - line.offset * 2;
    if (iw <= line.stroke * 2 || ih <= line.stroke * 2) continue;
    bands.push(...solidFrameBands(x + line.offset, y + line.offset, iw, ih, line.stroke));
  }
  return bands;
}

function doubleLines(t: number) {
  return [
    { offset: 0, stroke: t },
    { offset: Math.max(t + 1, Math.round(t * 2.2)), stroke: Math.max(1, Math.round(t * 0.55)) },
  ];
}

function tripleLines(t: number) {
  const gap = Math.max(t + 1, Math.round(t * 2.4));
  return [
    { offset: 0, stroke: t },
    { offset: gap, stroke: t },
    { offset: gap * 2, stroke: t },
  ];
}

function cornerBracketBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const arm = Math.max(t * 2, Math.min(Math.round(Math.max(3 * unitsPerMm, Math.min(w, h) * 0.18)), Math.floor(Math.min(w, h) / 2) - 1));
  return [
    { left: x, top: y, width: arm, height: t },
    { left: x, top: y, width: t, height: arm },
    { left: x + w - arm, top: y, width: arm, height: t },
    { left: x + w - t, top: y, width: t, height: arm },
    { left: x, top: y + h - t, width: arm, height: t },
    { left: x, top: y + h - arm, width: t, height: arm },
    { left: x + w - arm, top: y + h - t, width: arm, height: t },
    { left: x + w - t, top: y + h - arm, width: t, height: arm },
  ];
}

/** Registration "+" marks in each corner. Each mark sits fully inside the box. */
function crosshairBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const size = Math.max(t * 3, Math.min(Math.round(Math.max(3 * unitsPerMm, Math.min(w, h) * 0.14)), Math.floor(Math.min(w, h) / 2) - 1));
  const half = Math.floor(size / 2);
  const bands: FrameBand[] = [];
  const centres: [number, number][] = [
    [x + half, y + half],
    [x + w - size + half, y + half],
    [x + half, y + h - size + half],
    [x + w - size + half, y + h - size + half],
  ];
  const offset = Math.floor(t / 2);
  for (const [cx, cy] of centres) {
    bands.push({ left: cx - half, top: cy - offset, width: size, height: t });
    bands.push({ left: cx - offset, top: cy - half, width: t, height: size });
  }
  return bands;
}

function shadowBoxBands(x: number, y: number, w: number, h: number, t: number): FrameBand[] {
  const s = Math.max(t + 1, Math.round(t * 1.8));
  const fw = Math.max(t * 2 + 1, w - s);
  const fh = Math.max(t * 2 + 1, h - s);
  return [
    ...solidFrameBands(x, y, fw, fh, t),
    { left: x + fw, top: y + s, width: s, height: fh },
    { left: x + s, top: y + fh, width: fw, height: s },
  ];
}

/** Filled disc from row spans. */
function discBands(cx: number, cy: number, r: number): FrameBand[] {
  const bands: FrameBand[] = [];
  const top = Math.floor(cy - r);
  const bottom = Math.ceil(cy + r);
  for (let j = top; j < bottom; j++) {
    const dy = j + 0.5 - cy;
    if (Math.abs(dy) >= r) continue;
    const half = Math.sqrt(r * r - dy * dy);
    const left = Math.round(cx - half);
    const right = Math.round(cx + half);
    if (right > left) bands.push({ left, top: j, width: right - left, height: 1 });
  }
  return bands;
}

function industrialBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const r = Math.max(t, Math.round(0.6 * unitsPerMm));
  const c = t + Math.round(0.6 * unitsPerMm) + r;
  const bands = solidFrameBands(x, y, w, h, t);
  if (w > c * 2 + r * 2 && h > c * 2 + r * 2) {
    bands.push(
      ...discBands(x + c, y + c, r),
      ...discBands(x + w - c, y + c, r),
      ...discBands(x + c, y + h - c, r),
      ...discBands(x + w - c, y + h - c, r),
    );
  }
  return bands;
}

/** Thick diagonal drawn as a staircase of square dots, clamped to a region. */
function diagonalBands(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
  regionLeft: number,
  regionTop: number,
  regionRight: number,
  regionBottom: number,
): FrameBand[] {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  const bands: FrameBand[] = [];
  for (let i = 0; i <= steps; i++) {
    const px = ax + ((bx - ax) * i) / steps;
    const py = ay + ((by - ay) * i) / steps;
    const left = Math.min(Math.max(Math.round(px - t / 2), regionLeft), regionRight - t);
    const top = Math.min(Math.max(Math.round(py - t / 2), regionTop), regionBottom - t);
    bands.push({ left, top, width: t, height: t });
  }
  return bands;
}

/** Cut-corner octagon: four axis edges plus four staircased diagonals. */
function octagonBands(x: number, y: number, w: number, h: number, t: number): FrameBand[] {
  const minDim = Math.min(w, h);
  const cut = Math.max(t * 2, Math.min(Math.round(minDim * 0.2), Math.floor(minDim / 2) - t - 1));
  const edgeW = w - cut * 2;
  const edgeH = h - cut * 2;
  const bands: FrameBand[] = [];
  if (edgeW > 0) {
    bands.push({ left: x + cut, top: y, width: edgeW, height: t });
    bands.push({ left: x + cut, top: y + h - t, width: edgeW, height: t });
  }
  if (edgeH > 0) {
    bands.push({ left: x, top: y + cut, width: t, height: edgeH });
    bands.push({ left: x + w - t, top: y + cut, width: t, height: edgeH });
  }
  const diag = (ax: number, ay: number, bx: number, by: number) =>
    bands.push(...diagonalBands(ax, ay, bx, by, t, x, y, x + w, y + h));
  diag(x, y + cut, x + cut, y); // top-left
  diag(x + w - cut, y, x + w, y + cut); // top-right
  diag(x + w, y + h - cut, x + w - cut, y + h); // bottom-right
  diag(x + cut, y + h, x, y + h - cut); // bottom-left
  return bands;
}

/** Rounded frame with a filled stud in each corner. */
function cornerDotsBands(
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  unitsPerMm: number,
): FrameBand[] {
  const radius = Math.max(t * 2, Math.round(Math.min(w, h) * 0.08));
  const bands = outlineBands(x, y, w, h, t, unitsPerMm, 'solid-medium', roundedRectOutline(w, h, radius));
  const r = Math.max(t, Math.round(0.9 * unitsPerMm));
  const m = Math.max(radius, r + Math.round(0.4 * unitsPerMm));
  if (w > m * 2 + r && h > m * 2 + r) {
    bands.push(
      ...discBands(x + m, y + m, r),
      ...discBands(x + w - m, y + m, r),
      ...discBands(x + m, y + h - m, r),
      ...discBands(x + w - m, y + h - m, r),
    );
  }
  return bands;
}

/** Decorative corners: nested L-brackets with a filled corner stud. No full edges. */
function decoCornerBands(
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  unitsPerMm: number,
): FrameBand[] {
  const arm = Math.max(
    t * 3,
    Math.min(Math.round(Math.max(4 * unitsPerMm, Math.min(w, h) * 0.22)), Math.floor(Math.min(w, h) / 2) - t - 1),
  );
  const gap = Math.max(t + 1, Math.round(t * 2.2));
  const innerArm = Math.max(t * 2, Math.round(arm * 0.6));
  const innerT = Math.max(1, Math.round(t * 0.6));
  const dotR = Math.max(1, Math.round(t * 0.8));
  const bands: FrameBand[] = [];
  const corner = (ox: number, oy: number, dx: number, dy: number) => {
    // Outer L bracket.
    bands.push({ left: dx > 0 ? ox : ox - arm, top: dy > 0 ? oy : oy - t, width: arm, height: t });
    bands.push({ left: dx > 0 ? ox : ox - t, top: dy > 0 ? oy : oy - arm, width: t, height: arm });
    // Inner L bracket, offset inward by `gap`.
    bands.push({
      left: dx > 0 ? ox + gap : ox - gap - innerArm,
      top: dy > 0 ? oy + gap : oy - gap - innerT,
      width: innerArm,
      height: innerT,
    });
    bands.push({
      left: dx > 0 ? ox + gap : ox - gap - innerT,
      top: dy > 0 ? oy + gap : oy - gap - innerArm,
      width: innerT,
      height: innerArm,
    });
    // Corner stud, pulled inside so it stays within the region.
    if (w > dotR * 2 && h > dotR * 2) {
      bands.push(...discBands(ox + dx * dotR, oy + dy * dotR, dotR));
    }
  };
  corner(x, y, 1, 1);
  corner(x + w, y, -1, 1);
  corner(x, y + h, 1, -1);
  corner(x + w, y + h, -1, -1);
  return bands;
}

/** Dash-dot pattern along a rectangular frame. */
function dashDotFrameBands(x: number, y: number, w: number, h: number, t: number): FrameBand[] {
  const seq = [t * 3, t]; // dash, dot
  const gap = Math.max(1, Math.round(t * 1.5));
  const bands: FrameBand[] = [];
  const paint = (x0: number, y0: number, len: number, vertical: boolean) => {
    let pos = 0;
    let idx = 0;
    while (pos < len) {
      const seg = Math.min(seq[idx % 2], len - pos);
      if (seg > 0) {
        if (vertical) bands.push({ left: x0, top: y0 + pos, width: t, height: seg });
        else bands.push({ left: x0 + pos, top: y0, width: seg, height: t });
      }
      pos += seq[idx % 2] + gap;
      idx++;
    }
  };
  paint(x, y, w, false);
  paint(x, y + h - t, w, false);
  paint(x, y, h, true);
  paint(x + w - t, y, h, true);
  return bands;
}

/** Thick outer line with a thin inner line a wide gap inside (certificate look). */
function insetLines(t: number) {
  return [
    { offset: 0, stroke: t },
    { offset: Math.max(t * 2, Math.round(t * 3.5)), stroke: Math.max(1, Math.round(t * 0.5)) },
  ];
}

/** Filled disc centred at (cx,cy), but nudged so it never leaves the region. */
function discInRegion(
  cx: number,
  cy: number,
  r: number,
  regionLeft: number,
  regionTop: number,
  regionRight: number,
  regionBottom: number,
): FrameBand[] {
  const ccx = Math.min(Math.max(cx, regionLeft + r), regionRight - r);
  const ccy = Math.min(Math.max(cy, regionTop + r), regionBottom - r);
  return discBands(ccx, ccy, r);
}

/** Points walking the rectangle perimeter, ~`spacing` apart, one per corner. */
function perimeterPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  spacing: number,
): { cx: number; cy: number }[] {
  const pts: { cx: number; cy: number }[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i < n; i++) {
      const tt = i / n;
      pts.push({ cx: x0 + (x1 - x0) * tt, cy: y0 + (y1 - y0) * tt });
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
  return pts;
}

/** Thin frame with evenly spaced round beads along it. */
function beadedFrameBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const thin = Math.max(1, Math.round(t * 0.5));
  const r = Math.max(t, Math.round(0.7 * unitsPerMm));
  const off = r;
  const iw = w - off * 2;
  const ih = h - off * 2;
  if (iw <= 0 || ih <= 0) return solidFrameBands(x, y, w, h, thin);
  const bands = solidFrameBands(x + off, y + off, iw, ih, thin);
  const spacing = Math.max(r * 3, Math.round(3 * unitsPerMm));
  for (const p of perimeterPoints(x + off, y + off, iw, ih, spacing)) {
    bands.push(...discInRegion(p.cx, p.cy, r, x, y, x + w, y + h));
  }
  return bands;
}

/** Half of a disc, kept to one side of its centre (for scalloped edges). */
function halfDiscBands(cx: number, cy: number, r: number, keep: 'below' | 'above' | 'right' | 'left'): FrameBand[] {
  const out: FrameBand[] = [];
  const mx = Math.round(cx);
  for (const b of discBands(cx, cy, r)) {
    if (keep === 'below') {
      if (b.top >= cy) out.push(b);
    } else if (keep === 'above') {
      if (b.top < cy) out.push(b);
    } else if (keep === 'right') {
      const nl = Math.max(b.left, mx);
      const nw = b.left + b.width - nl;
      if (nw > 0) out.push({ ...b, left: nl, width: nw });
    } else {
      const nw = Math.min(b.left + b.width, mx) - b.left;
      if (nw > 0) out.push({ ...b, width: nw });
    }
  }
  return out;
}

/** Scalloped trim: a straight frame line with semicircular bumps bulging inward. */
function scallopFrameBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const thin = Math.max(1, Math.round(t * 0.5));
  const r = Math.max(t, Math.round(0.8 * unitsPerMm));
  const bands = solidFrameBands(x, y, w, h, thin);
  const edge = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    keep: 'below' | 'above' | 'right' | 'left',
  ) => {
    const len = Math.hypot(bx - ax, by - ay);
    if (len <= 0) return;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const n = Math.max(1, Math.round(len / (r * 2)));
    for (let i = 0; i < n; i++) {
      const d = (len * (i + 0.5)) / n;
      bands.push(...halfDiscBands(ax + ux * d, ay + uy * d, r, keep));
    }
  };
  edge(x, y, x + w, y, 'below');
  edge(x, y + h, x + w, y + h, 'above');
  edge(x, y, x, y + h, 'right');
  edge(x + w, y, x + w, y + h, 'left');
  return bands;
}

/** Triangle-wave (zigzag) line around the frame. */
function zigzagFrameBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const amp = Math.max(t * 2, Math.round(1.4 * unitsPerMm));
  const step = Math.max(t * 3, Math.round(2.6 * unitsPerMm));
  const rL = x;
  const rT = y;
  const rR = x + w;
  const rB = y + h;
  const bands: FrameBand[] = [];
  const edge = (ax: number, ay: number, bx: number, by: number, inx: number, iny: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    if (len <= 0) return;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const n = Math.max(2, Math.round(len / step));
    let px = ax;
    let py = ay;
    for (let i = 1; i <= n; i++) {
      const d = (len * i) / n;
      const peak = i % 2 === 1 && i < n;
      const nx = ax + ux * d + (peak ? inx * amp : 0);
      const ny = ay + uy * d + (peak ? iny * amp : 0);
      bands.push(...diagonalBands(px, py, nx, ny, t, rL, rT, rR, rB));
      px = nx;
      py = ny;
    }
  };
  edge(x, y, x + w, y, 0, 1); // top
  edge(x + w, y, x + w, y + h, -1, 0); // right
  edge(x + w, y + h, x, y + h, 0, -1); // bottom
  edge(x, y + h, x, y, 1, 0); // left
  return bands;
}

/** Diagonal hatch band around the frame — a twisted rope / cord look. */
function ropeFrameBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const band = Math.max(t * 2, Math.round(1.8 * unitsPerMm));
  const stride = Math.max(2, Math.round(band * 0.8));
  const rL = x;
  const rT = y;
  const rR = x + w;
  const rB = y + h;
  const bands: FrameBand[] = [];
  // Top & bottom: slanted strokes across a horizontal band.
  for (let sx = x - band; sx < x + w; sx += stride) {
    bands.push(...diagonalBands(sx, y + band, sx + band, y, t, rL, rT, rR, rB));
    bands.push(...diagonalBands(sx, y + h, sx + band, y + h - band, t, rL, rT, rR, rB));
  }
  // Left & right: slanted strokes across a vertical band.
  for (let sy = y - band; sy < y + h; sy += stride) {
    bands.push(...diagonalBands(x, sy + band, x + band, sy, t, rL, rT, rR, rB));
    bands.push(...diagonalBands(x + w, sy + band, x + w - band, sy, t, rL, rT, rR, rB));
  }
  return bands;
}

/** Elaborate corner flourishes: nested brackets, a diagonal spur and beads. No full edges. */
function ornateCornerBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const arm = Math.max(
    t * 4,
    Math.min(Math.round(Math.max(5 * unitsPerMm, Math.min(w, h) * 0.26)), Math.floor(Math.min(w, h) / 2) - t - 1),
  );
  const gap = Math.max(t + 1, Math.round(t * 2.4));
  const innerArm = Math.max(t * 2, Math.round(arm * 0.6));
  const innerT = Math.max(1, Math.round(t * 0.6));
  const spur = Math.max(t * 2, Math.round(arm * 0.45));
  const beadR = Math.max(1, Math.round(t * 0.9));
  const rL = x;
  const rT = y;
  const rR = x + w;
  const rB = y + h;
  const bands: FrameBand[] = [];
  const corner = (ox: number, oy: number, dx: number, dy: number) => {
    // Outer L bracket.
    bands.push({ left: dx > 0 ? ox : ox - arm, top: dy > 0 ? oy : oy - t, width: arm, height: t });
    bands.push({ left: dx > 0 ? ox : ox - t, top: dy > 0 ? oy : oy - arm, width: t, height: arm });
    // Inner L bracket.
    bands.push({
      left: dx > 0 ? ox + gap : ox - gap - innerArm,
      top: dy > 0 ? oy + gap : oy - gap - innerT,
      width: innerArm,
      height: innerT,
    });
    bands.push({
      left: dx > 0 ? ox + gap : ox - gap - innerT,
      top: dy > 0 ? oy + gap : oy - gap - innerArm,
      width: innerT,
      height: innerArm,
    });
    // Diagonal spur from the corner, with a bead at its tip.
    bands.push(...diagonalBands(ox, oy, ox + dx * spur, oy + dy * spur, t, rL, rT, rR, rB));
    bands.push(...discInRegion(ox + dx * spur, oy + dy * spur, beadR, rL, rT, rR, rB));
    // Beads at each arm tip.
    bands.push(...discInRegion(ox + dx * arm, oy + dy * Math.round(t / 2), beadR, rL, rT, rR, rB));
    bands.push(...discInRegion(ox + dx * Math.round(t / 2), oy + dy * arm, beadR, rL, rT, rR, rB));
  };
  corner(x, y, 1, 1);
  corner(x + w, y, -1, 1);
  corner(x, y + h, 1, -1);
  corner(x + w, y + h, -1, -1);
  return bands;
}

/** Double line with round beads running in the channel between the two lines. */
function doubleBeadFrameBands(x: number, y: number, w: number, h: number, t: number, unitsPerMm: number): FrameBand[] {
  const lines = doubleLines(t);
  const bands = nestedFrameBands(x, y, w, h, lines);
  const channel = Math.max(t + 1, Math.round(lines[1].offset * 0.55));
  const r = Math.max(1, Math.round(t * 0.5));
  const iw = w - channel * 2;
  const ih = h - channel * 2;
  if (iw > 0 && ih > 0) {
    const spacing = Math.max(r * 3, Math.round(3 * unitsPerMm));
    for (const p of perimeterPoints(x + channel, y + channel, iw, ih, spacing)) {
      bands.push(...discInRegion(p.cx, p.cy, r, x, y, x + w, y + h));
    }
  }
  return bands;
}

/** Ink depth for one pixel: how far inside the outline it sits, and where it is around the outline (0–1). */
type Outline = {
  depth: (px: number, py: number) => number;
  around: (px: number, py: number) => number;
  perimeter: number;
  /** Per row: candidate x spans (half-open) that may hold ink no deeper than `maxDepth`. */
  rowSpans: (py: number, maxDepth: number) => [number, number][];
};

function roundedRectOutline(w: number, h: number, radius: number): Outline {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return {
    depth(px, py) {
      if (px < 0 || py < 0 || px > w || py > h) return -1;
      const qx = Math.max(r - px, px - (w - r), 0);
      const qy = Math.max(r - py, py - (h - r), 0);
      if (qx > 0 && qy > 0) return r - Math.hypot(qx, qy);
      return Math.min(px, w - px, py, h - py);
    },
    around(px, py) {
      return (Math.atan2(py - h / 2, px - w / 2) + Math.PI) / (2 * Math.PI);
    },
    perimeter: 2 * (w + h) - (8 - 2 * Math.PI) * r,
    rowSpans(py, maxDepth) {
      const band = Math.ceil(Math.max(maxDepth, r)) + 1;
      if (py < band || py > h - band) return [[0, w]];
      const edge = Math.ceil(maxDepth) + 1;
      return [
        [0, Math.min(w, edge)],
        [Math.max(0, w - edge), w],
      ];
    },
  };
}

function ellipseOutline(w: number, h: number, circle: boolean): Outline {
  const rx = circle ? Math.min(w, h) / 2 : w / 2;
  const ry = circle ? Math.min(w, h) / 2 : h / 2;
  const cx = w / 2;
  const cy = h / 2;
  const halfWidth = (py: number, radiusX: number, radiusY: number) => {
    if (radiusX <= 0 || radiusY <= 0) return 0;
    const dy = (py - cy) / radiusY;
    return Math.abs(dy) >= 1 ? 0 : radiusX * Math.sqrt(1 - dy * dy);
  };
  return {
    depth(px, py) {
      const dx = px - cx;
      const dy = py - cy;
      const rho = Math.hypot(dx / rx, dy / ry);
      if (rho > 1) return -1;
      if (rho === 0) return Math.min(rx, ry);
      return Math.hypot(dx, dy) * (1 / rho - 1);
    },
    around(px, py) {
      return (Math.atan2((py - cy) / ry, (px - cx) / rx) + Math.PI) / (2 * Math.PI);
    },
    perimeter: 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2),
    rowSpans(py, maxDepth) {
      const outer = halfWidth(py, rx, ry);
      if (outer <= 0) return [];
      const inner = halfWidth(py, rx - maxDepth - 1, ry - maxDepth - 1);
      const l0 = Math.floor(cx - outer) - 1;
      const r1 = Math.ceil(cx + outer) + 1;
      if (inner <= 0) return [[l0, r1]];
      return [
        [l0, Math.ceil(cx - inner) + 1],
        [Math.floor(cx + inner) - 1, r1],
      ];
    },
  };
}

/**
 * Rasterize `ink(depth, around, i, j)` over an outline into row runs, then merge
 * identical runs on consecutive rows into taller bands.
 */
function rasterOutline(
  x: number,
  y: number,
  w: number,
  h: number,
  outline: Outline,
  maxDepth: number,
  ink: (depth: number, around: number, i: number, j: number) => boolean,
): FrameBand[] {
  const bands: FrameBand[] = [];
  let open = new Map<string, FrameBand>();
  for (let j = 0; j < h; j++) {
    const py = j + 0.5;
    const next = new Map<string, FrameBand>();
    for (const [a, b] of outline.rowSpans(py, maxDepth)) {
      const start = Math.max(0, Math.floor(a));
      const end = Math.min(w, Math.ceil(b));
      let runStart = -1;
      for (let i = start; i <= end; i++) {
        let on = false;
        if (i < end) {
          const px = i + 0.5;
          const d = outline.depth(px, py);
          on = d >= 0 && d < maxDepth && ink(d, outline.around(px, py), i, j);
        }
        if (on && runStart < 0) runStart = i;
        if (!on && runStart >= 0) {
          const key = `${runStart}:${i - runStart}`;
          const prev = open.get(key);
          if (prev && !next.has(key)) {
            prev.height += 1;
            next.set(key, prev);
          } else if (!next.has(key)) {
            const band = { left: x + runStart, top: y + j, width: i - runStart, height: 1 };
            bands.push(band);
            next.set(key, band);
          }
          runStart = -1;
        }
      }
    }
    open = next;
  }
  return bands;
}

function dashTest(perimeter: number, t: number, dotted: boolean) {
  const dash = dotted ? t : t * 3;
  const gap = dotted ? t * 1.5 : t * 2;
  const count = Math.max(4, Math.round(perimeter / (dash + gap)));
  const ratio = dash / (dash + gap);
  return (around: number) => (around * count) % 1 < ratio;
}

function dashDotTest(perimeter: number, t: number) {
  const dash = t * 3;
  const dot = t;
  const gap = t * 1.5;
  const unit = dash + gap + dot + gap;
  const count = Math.max(2, Math.round(perimeter / unit));
  return (around: number) => {
    const p = (((around * count) % 1) + 1) % 1 * unit;
    return p < dash || (p >= dash + gap && p < dash + gap + dot);
  };
}

function stripeParams(t: number, unitsPerMm: number) {
  const band = Math.max(t * 3, Math.round(2.4 * unitsPerMm));
  const period = Math.max(4, Math.round(1.6 * unitsPerMm));
  const edge = Math.max(1, Math.round(t * 0.5));
  return { band, period, edge };
}

/** Ink for one style on a curved outline (rounded rect, pill, circle, ellipse). */
function outlineBands(
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  unitsPerMm: number,
  style: BorderStyleId,
  outline: Outline,
): FrameBand[] {
  switch (style) {
    case 'dashed':
    case 'dotted': {
      const on = dashTest(outline.perimeter, t, style === 'dotted');
      return rasterOutline(x, y, w, h, outline, t, (_d, around) => on(around));
    }
    case 'dash-dot': {
      const on = dashDotTest(outline.perimeter, t);
      return rasterOutline(x, y, w, h, outline, t, (_d, around) => on(around));
    }
    case 'double':
    case 'rounded-double': {
      const [outer, inner] = doubleLines(t);
      const maxDepth = inner.offset + inner.stroke;
      return rasterOutline(x, y, w, h, outline, maxDepth, (d) => d < outer.stroke || d >= inner.offset);
    }
    case 'hairline-inset': {
      const [outer, inner] = insetLines(t);
      const maxDepth = inner.offset + inner.stroke;
      return rasterOutline(
        x,
        y,
        w,
        h,
        outline,
        maxDepth,
        (d) => d < outer.stroke || (d >= inner.offset && d < inner.offset + inner.stroke),
      );
    }
    case 'triple-line': {
      const lines = tripleLines(t);
      const maxDepth = lines[2].offset + lines[2].stroke;
      return rasterOutline(x, y, w, h, outline, maxDepth, (d) =>
        lines.some((line) => d >= line.offset && d < line.offset + line.stroke),
      );
    }
    case 'caution-stripes': {
      const { band, period, edge } = stripeParams(t, unitsPerMm);
      return rasterOutline(
        x,
        y,
        w,
        h,
        outline,
        band,
        (d, _around, i, j) => d < edge || d >= band - edge || (i + j) % period < period / 2,
      );
    }
    case 'ticket-notch':
      return rasterOutline(x, y, w, h, outline, t, (_d, around) => {
        const p = ((around % 1) + 1) % 1;
        return ![0, 0.25, 0.5, 0.75].some((cardinal) => {
          const distance = Math.min(Math.abs(p - cardinal), 1 - Math.abs(p - cardinal));
          return distance < 0.045;
        });
      });
    default:
      return rasterOutline(x, y, w, h, outline, t, () => true);
  }
}

/** Solid frame with a gap in the middle of each side. */
function ticketNotchBands(x: number, y: number, w: number, h: number, t: number): FrameBand[] {
  const notch = Math.max(
    t * 2,
    Math.min(Math.round(Math.min(w, h) * 0.12), Math.floor(Math.min(w, h) / 3)),
  );
  const topLen = Math.floor((w - notch) / 2);
  const sideLen = Math.floor((h - notch) / 2);
  if (topLen < t || sideLen < t) return solidFrameBands(x, y, w, h, t);
  return [
    { left: x, top: y, width: topLen, height: t },
    { left: x + w - topLen, top: y, width: topLen, height: t },
    { left: x, top: y + h - t, width: topLen, height: t },
    { left: x + w - topLen, top: y + h - t, width: topLen, height: t },
    { left: x, top: y, width: t, height: sideLen },
    { left: x, top: y + h - sideLen, width: t, height: sideLen },
    { left: x + w - t, top: y, width: t, height: sideLen },
    { left: x + w - t, top: y + h - sideLen, width: t, height: sideLen },
  ];
}

/**
 * Border ink inside a region (already inset). Units are integer printer dots on
 * paper or physical pixels on screen, so the editor and the printer draw the
 * same shape. `stroke` is the line width in those units.
 */
export function styledBorderBands(params: {
  x: number;
  y: number;
  w: number;
  h: number;
  unitsPerMm: number;
  stroke: number;
  style: BorderStyleId;
  shape: BorderShape;
}): FrameBand[] {
  const { x, y, unitsPerMm, style, shape } = params;
  const w = Math.max(1, Math.round(params.w));
  const h = Math.max(1, Math.round(params.h));
  const t = Math.max(1, Math.round(params.stroke));

  if (shape === 'circle' || shape === 'ellipse') {
    return outlineBands(x, y, w, h, t, unitsPerMm, style, ellipseOutline(w, h, shape === 'circle'));
  }

  switch (style) {
    case 'dashed':
    case 'dotted':
      return dashedFrameBands(x, y, w, h, t, style === 'dotted');
    case 'dash-dot':
      return dashDotFrameBands(x, y, w, h, t);
    case 'double':
      return nestedFrameBands(x, y, w, h, doubleLines(t));
    case 'triple-line':
      return nestedFrameBands(x, y, w, h, tripleLines(t));
    case 'hairline-inset':
      return nestedFrameBands(x, y, w, h, insetLines(t));
    case 'rounded':
      return outlineBands(
        x,
        y,
        w,
        h,
        t,
        unitsPerMm,
        'solid-medium',
        roundedRectOutline(w, h, Math.max(t * 2, Math.round(Math.min(w, h) * 0.08))),
      );
    case 'pill-shape':
      return outlineBands(x, y, w, h, t, unitsPerMm, 'solid-medium', roundedRectOutline(w, h, Math.min(w, h) / 2));
    case 'bold-frame':
      return outlineBands(
        x,
        y,
        w,
        h,
        t,
        unitsPerMm,
        'solid-medium',
        roundedRectOutline(w, h, Math.max(t * 2, Math.round(Math.min(w, h) * 0.1))),
      );
    case 'rounded-double':
      return outlineBands(
        x,
        y,
        w,
        h,
        t,
        unitsPerMm,
        'rounded-double',
        roundedRectOutline(w, h, Math.max(t * 2, Math.round(Math.min(w, h) * 0.08))),
      );
    case 'octagon':
      return octagonBands(x, y, w, h, t);
    case 'corner-dots':
      return cornerDotsBands(x, y, w, h, t, unitsPerMm);
    case 'deco-corner':
      return decoCornerBands(x, y, w, h, t, unitsPerMm);
    case 'beaded':
      return beadedFrameBands(x, y, w, h, t, unitsPerMm);
    case 'scallop':
      return scallopFrameBands(x, y, w, h, t, unitsPerMm);
    case 'zigzag':
      return zigzagFrameBands(x, y, w, h, t, unitsPerMm);
    case 'rope':
      return ropeFrameBands(x, y, w, h, t, unitsPerMm);
    case 'ornate-corner':
      return ornateCornerBands(x, y, w, h, t, unitsPerMm);
    case 'double-bead':
      return doubleBeadFrameBands(x, y, w, h, t, unitsPerMm);
    case 'shadow-box':
      return shadowBoxBands(x, y, w, h, t);
    case 'corner-brackets':
      return cornerBracketBands(x, y, w, h, t, unitsPerMm);
    case 'crosshair':
      return crosshairBands(x, y, w, h, t, unitsPerMm);
    case 'industrial':
      return industrialBands(x, y, w, h, t, unitsPerMm);
    case 'caution-stripes':
      return outlineBands(x, y, w, h, t, unitsPerMm, style, roundedRectOutline(w, h, 0));
    case 'ticket-notch':
      return ticketNotchBands(x, y, w, h, t);
    default:
      return solidFrameBands(x, y, w, h, t);
  }
}
