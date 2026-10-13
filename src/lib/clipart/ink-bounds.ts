import { parseSvgDrawOps, type ClipartDrawOp } from '@/lib/clipart/parse-svg';

/** Square in the sticker's own units that the ink (including stroke) fills. */
export type InkSquare = { x: number; y: number; side: number };

const FULL: InkSquare = { x: 0, y: 0, side: 24 };

type Box = { minX: number; minY: number; maxX: number; maxY: number; empty: boolean };

function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, empty: true };
}

function add(box: Box, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  box.empty = false;
  if (x < box.minX) box.minX = x;
  if (y < box.minY) box.minY = y;
  if (x > box.maxX) box.maxX = x;
  if (y > box.maxY) box.maxY = y;
}

function padBox(box: Box, pad: number): void {
  if (box.empty || !(pad > 0)) return;
  box.minX -= pad;
  box.minY -= pad;
  box.maxX += pad;
  box.maxY += pad;
}

/** SVG arc, sampled so the bound follows the curve rather than the radii. */
function addArc(
  box: Box,
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phiDeg: number,
  large: number,
  sweep: number,
  x2: number,
  y2: number,
): void {
  add(box, x1, y1);
  add(box, x2, y2);
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!(rx > 1e-6) || !(ry > 1e-6)) return;
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  let x1p = cos * dx + sin * dy;
  let y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const sign = large === sweep ? -1 : 1;
  const num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / (den || 1)));
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= Math.PI * 2;
  if (sweep && dtheta < 0) dtheta += Math.PI * 2;
  const steps = Math.max(8, Math.ceil(Math.abs(dtheta) / (Math.PI / 12)));
  for (let s = 0; s <= steps; s++) {
    const t = theta1 + (dtheta * s) / steps;
    const px = rx * Math.cos(t);
    const py = ry * Math.sin(t);
    add(box, cos * px - sin * py + cx, sin * px + cos * py + cy);
  }
}

function addPath(box: Box, d: string): void {
  let i = 0;
  const len = d.length;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCx = 0;
  let prevCy = 0;
  let prevCmd = '';

  const isCmd = (c: string) => /[a-zA-Z]/.test(c);
  const skip = () => {
    while (i < len && (d[i] === ' ' || d[i] === ',' || d[i] === '\n' || d[i] === '\t' || d[i] === '\r')) i++;
  };
  const readNum = (): number | null => {
    skip();
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
    return Number(d.slice(start, i));
  };

  while (i < len) {
    skip();
    if (i >= len) break;
    let cmd = d[i]!;
    if (!isCmd(cmd)) {
      if (prevCmd === 'M') cmd = 'L';
      else if (prevCmd === 'm') cmd = 'l';
      else cmd = prevCmd;
    } else {
      i++;
    }
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const abs = cmd.toUpperCase();
    if (abs === 'Z') {
      cx = sx;
      cy = sy;
      prevCmd = cmd;
      continue;
    }
    if (abs === 'H') {
      const x = readNum();
      if (x == null) break;
      cx = rel ? cx + x : x;
      add(box, cx, cy);
      prevCmd = cmd;
      continue;
    }
    if (abs === 'V') {
      const y = readNum();
      if (y == null) break;
      cy = rel ? cy + y : y;
      add(box, cx, cy);
      prevCmd = cmd;
      continue;
    }
    if (abs === 'M' || abs === 'L') {
      const x = readNum();
      const y = readNum();
      if (x == null || y == null) break;
      cx = rel ? cx + x : x;
      cy = rel ? cy + y : y;
      if (abs === 'M') {
        sx = cx;
        sy = cy;
      }
      add(box, cx, cy);
      prevCx = cx;
      prevCy = cy;
      prevCmd = cmd;
      continue;
    }
    if (abs === 'C') {
      const x1 = readNum();
      const y1 = readNum();
      const x2 = readNum();
      const y2 = readNum();
      const x = readNum();
      const y = readNum();
      if (x1 == null || y1 == null || x2 == null || y2 == null || x == null || y == null) break;
      const c1x = rel ? cx + x1 : x1;
      const c1y = rel ? cy + y1 : y1;
      const c2x = rel ? cx + x2 : x2;
      const c2y = rel ? cy + y2 : y2;
      const nx = rel ? cx + x : x;
      const ny = rel ? cy + y : y;
      add(box, c1x, c1y);
      add(box, c2x, c2y);
      add(box, nx, ny);
      prevCx = c2x;
      prevCy = c2y;
      cx = nx;
      cy = ny;
      prevCmd = cmd;
      continue;
    }
    if (abs === 'S') {
      const x2 = readNum();
      const y2 = readNum();
      const x = readNum();
      const y = readNum();
      if (x2 == null || y2 == null || x == null || y == null) break;
      const smooth = prevCmd.toUpperCase() === 'C' || prevCmd.toUpperCase() === 'S';
      const c1x = smooth ? 2 * cx - prevCx : cx;
      const c1y = smooth ? 2 * cy - prevCy : cy;
      const c2x = rel ? cx + x2 : x2;
      const c2y = rel ? cy + y2 : y2;
      const nx = rel ? cx + x : x;
      const ny = rel ? cy + y : y;
      add(box, c1x, c1y);
      add(box, c2x, c2y);
      add(box, nx, ny);
      prevCx = c2x;
      prevCy = c2y;
      cx = nx;
      cy = ny;
      prevCmd = cmd;
      continue;
    }
    if (abs === 'Q') {
      const x1 = readNum();
      const y1 = readNum();
      const x = readNum();
      const y = readNum();
      if (x1 == null || y1 == null || x == null || y == null) break;
      const c1x = rel ? cx + x1 : x1;
      const c1y = rel ? cy + y1 : y1;
      const nx = rel ? cx + x : x;
      const ny = rel ? cy + y : y;
      add(box, c1x, c1y);
      add(box, nx, ny);
      prevCx = c1x;
      prevCy = c1y;
      cx = nx;
      cy = ny;
      prevCmd = cmd;
      continue;
    }
    if (abs === 'T') {
      const x = readNum();
      const y = readNum();
      if (x == null || y == null) break;
      const smooth = prevCmd.toUpperCase() === 'Q' || prevCmd.toUpperCase() === 'T';
      const c1x = smooth ? 2 * cx - prevCx : cx;
      const c1y = smooth ? 2 * cy - prevCy : cy;
      const nx = rel ? cx + x : x;
      const ny = rel ? cy + y : y;
      add(box, c1x, c1y);
      add(box, nx, ny);
      prevCx = c1x;
      prevCy = c1y;
      cx = nx;
      cy = ny;
      prevCmd = cmd;
      continue;
    }
    if (abs === 'A') {
      const rx = readNum();
      const ry = readNum();
      const rot = readNum();
      skip();
      const largeCh = d[i];
      const large = largeCh === '0' || largeCh === '1' ? Number(largeCh) : null;
      if (large != null) i++;
      skip();
      const sweepCh = d[i];
      const sweep = sweepCh === '0' || sweepCh === '1' ? Number(sweepCh) : null;
      if (sweep != null) i++;
      const x = readNum();
      const y = readNum();
      if (rx == null || ry == null || rot == null || large == null || sweep == null || x == null || y == null) break;
      const nx = rel ? cx + x : x;
      const ny = rel ? cy + y : y;
      addArc(box, cx, cy, rx, ry, rot, large, sweep, nx, ny);
      cx = nx;
      cy = ny;
      prevCmd = cmd;
      continue;
    }
    break;
  }
}

function opBox(op: ClipartDrawOp, strokeScale: number): Box {
  const box = emptyBox();
  const sw = op.t === 'line' || !op.fill ? op.sw * strokeScale : 0;
  switch (op.t) {
    case 'circle':
      add(box, op.x - op.r, op.y - op.r);
      add(box, op.x + op.r, op.y + op.r);
      break;
    case 'ellipse':
      add(box, op.x - op.rx, op.y - op.ry);
      add(box, op.x + op.rx, op.y + op.ry);
      break;
    case 'rect':
      add(box, op.x, op.y);
      add(box, op.x + op.w, op.y + op.h);
      break;
    case 'line':
      add(box, op.a, op.b);
      add(box, op.c, op.d);
      break;
    case 'polygon':
      for (const pair of op.pts.trim().split(/\s+/)) {
        const [xs, ys] = pair.split(',');
        add(box, Number(xs), Number(ys));
      }
      break;
    case 'path':
      addPath(box, op.d);
      break;
    default:
      break;
  }
  padBox(box, sw / 2);
  return box;
}

/**
 * Empty share of the frame on each side. The selection border sits this far
 * off the stroke, and the share stays the same while the box is resized.
 */
const FRAME_MARGIN = 0.08;

/**
 * Square around the sticker ink, with a little room before the frame.
 * The 24×24 artboard is not the frame: that margin changed whenever a resize
 * scaled the snapshot and left the stroke behind.
 */
export function inkSquare(ops: ClipartDrawOp[], strokeScale = 1): InkSquare {
  const box = emptyBox();
  for (const op of ops) {
    const part = opBox(op, strokeScale);
    if (part.empty) continue;
    add(box, part.minX, part.minY);
    add(box, part.maxX, part.maxY);
  }
  if (box.empty) return FULL;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const side = Math.max(w, h, 0.5);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const fitted = side / (1 - 2 * FRAME_MARGIN);
  return { x: cx - fitted / 2, y: cy - fitted / 2, side: fitted };
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

/** Point the SVG viewBox at the ink square so the glyph fills its frame. */
export function fitSvgViewBoxToInk(svg: string, strokeScale = 1): string {
  const sq = inkSquare(parseSvgDrawOps(svg), strokeScale);
  const viewBox = `viewBox="${fmt(sq.x)} ${fmt(sq.y)} ${fmt(sq.side)} ${fmt(sq.side)}"`;
  if (/viewBox="/.test(svg)) return svg.replace(/viewBox="[^"]*"/, viewBox);
  return svg.replace('<svg', `<svg ${viewBox}`);
}
