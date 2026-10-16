/**
 * Synthetic page builders for the Smart Crop tests.
 *
 * The long edge is 1000 px, the same as `analysisLongEdge`, so nothing is
 * downscaled and a fixture's pixel coordinates are the detector's coordinates.
 *
 * Text is drawn as pseudo-glyphs that vary from cell to cell, because that
 * variation is exactly what the classifier uses to tell a text line from a
 * dashed rule and from a barcode. Perfectly regular "text" would make these
 * tests pass for the wrong reason.
 */

import type { GrayPage } from '../types';

export const PAGE_W = 760;
export const PAGE_H = 1000;

/** Deterministic PRNG, so a failure is always reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blank(w = PAGE_W, h = PAGE_H, level = 255): GrayPage {
  const gray = new Uint8Array(w * h);
  gray.fill(level);
  return { width: w, height: h, gray };
}

export function fill(p: GrayPage, x: number, y: number, w: number, h: number, level = 0): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(p.width, Math.round(x + w));
  const y1 = Math.min(p.height, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * p.width;
    for (let xx = x0; xx < x1; xx++) p.gray[row + xx] = level;
  }
}

export function hRule(p: GrayPage, x: number, y: number, len: number, thick = 2, level = 0): void {
  fill(p, x, y, len, thick, level);
}

export function vRule(p: GrayPage, x: number, y: number, len: number, thick = 2, level = 0): void {
  fill(p, x, y, thick, len, level);
}

export function hDashed(
  p: GrayPage,
  x: number,
  y: number,
  len: number,
  thick = 2,
  dash = 12,
  gap = 7,
  level = 0,
): void {
  for (let cx = x; cx < x + len; cx += dash + gap) {
    fill(p, cx, y, Math.min(dash, x + len - cx), thick, level);
  }
}

export function vDashed(
  p: GrayPage,
  x: number,
  y: number,
  len: number,
  thick = 2,
  dash = 12,
  gap = 7,
  level = 0,
): void {
  for (let cy = y; cy < y + len; cy += dash + gap) {
    fill(p, x, cy, thick, Math.min(dash, y + len - cy), level);
  }
}

/**
 * One line of pseudo-text. Word gaps stay at or below the dash-merge gap so the
 * line closes into a full-width run — that is what makes it a *candidate* the
 * classifier then has to reject.
 */
export function textLine(
  p: GrayPage,
  x: number,
  y: number,
  len: number,
  height = 14,
  seed = 1,
  level = 0,
): void {
  const rnd = mulberry32(seed);
  const cell = 6;
  let cx = x;
  while (cx < x + len) {
    const wordLen = 24 + Math.floor(rnd() * 46);
    const end = Math.min(x + len, cx + wordLen);
    for (let gx = cx; gx < end; gx += cell) {
      const gw = Math.min(cell - 1, end - gx);
      if (gw <= 0) break;
      const strokes = 1 + Math.floor(rnd() * 2);
      for (let s = 0; s < strokes; s++) {
        fill(p, gx + Math.floor(rnd() * Math.max(1, gw - 1)), y, 1, height, level);
      }
      const bars = Math.floor(rnd() * 2);
      for (let b = 0; b < bars; b++) {
        fill(p, gx, y + Math.floor(rnd() * Math.max(1, height - 2)), gw, 2, level);
      }
    }
    cx = end + 8;
  }
}

export function textBlock(
  p: GrayPage,
  x: number,
  y: number,
  w: number,
  h: number,
  lineH = 14,
  lineGap = 6,
  seed = 1,
): void {
  let cy = y;
  let n = 0;
  while (cy + lineH <= y + h) {
    textLine(p, x, cy, w, lineH, seed + n * 17);
    cy += lineH + lineGap;
    n++;
  }
}

/** Vertical-bar 1D barcode: dense and identical row to row. */
export function barcode(p: GrayPage, x: number, y: number, w: number, h: number, seed = 7): void {
  const rnd = mulberry32(seed);
  let cx = x;
  while (cx < x + w) {
    const bar = 2 + Math.floor(rnd() * 4);
    const gap = 2 + Math.floor(rnd() * 3);
    fill(p, cx, y, Math.min(bar, x + w - cx), h, 0);
    cx += bar + gap;
  }
}

export function qrBlock(p: GrayPage, x: number, y: number, size: number, module = 5, seed = 11): void {
  const rnd = mulberry32(seed);
  for (let gy = 0; gy < size; gy += module) {
    for (let gx = 0; gx < size; gx += module) {
      if (rnd() > 0.5) fill(p, x + gx, y + gy, module, module, 0);
    }
  }
}

export function boxBorder(p: GrayPage, x: number, y: number, w: number, h: number, thick = 2): void {
  fill(p, x, y, w, thick);
  fill(p, x, y + h - thick, w, thick);
  fill(p, x, y, thick, h);
  fill(p, x + w - thick, y, thick, h);
}

export function rotate(p: GrayPage, deg: 0 | 90 | 180 | 270): GrayPage {
  if (deg === 0) return p;
  if (deg === 180) {
    const out = new Uint8Array(p.gray.length);
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        out[(p.height - 1 - y) * p.width + (p.width - 1 - x)] = p.gray[y * p.width + x];
      }
    }
    return { width: p.width, height: p.height, gray: out };
  }
  const w = p.height;
  const h = p.width;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const dx = deg === 90 ? p.height - 1 - y : y;
      const dy = deg === 90 ? x : p.width - 1 - x;
      out[dy * w + dx] = p.gray[y * p.width + x];
    }
  }
  return { width: w, height: h, gray: out };
}

/**
 * Small rotation by shearing — what a slightly skewed scan looks like.
 * `vertical` shifts each column up or down, tilting horizontal rules; the
 * default shifts each row sideways, tilting vertical rules. (A row shear leaves
 * horizontal rules perfectly horizontal, so it cannot test them.)
 */
export function shear(p: GrayPage, deg: number, vertical = false): GrayPage {
  const t = Math.tan((deg * Math.PI) / 180);
  const out = new Uint8Array(p.gray.length);
  out.fill(255);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const sx = vertical ? x : x - Math.round((y - p.height / 2) * t);
      const sy = vertical ? y - Math.round((x - p.width / 2) * t) : y;
      if (sx >= 0 && sx < p.width && sy >= 0 && sy < p.height) {
        out[y * p.width + x] = p.gray[sy * p.width + sx];
      }
    }
  }
  return { width: p.width, height: p.height, gray: out };
}

// ── Named fixtures ──────────────────────────────────────────────────────────
//
// Separator fixtures keep the gaps around the separator BELOW `gutterMin`
// (~36 px here), so whitespace cannot do the splitting and the separator path
// under test is the only thing that can.

/** Text block ends at y=434. */
export function fxDashedH(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 400);
  hDashed(p, 40, 456, 680, 2);
  textBlock(p, 40, 478, 680, 460);
  return p;
}

export function fxDashedV(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 330, 900);
  vDashed(p, 382, 40, 900, 2);
  textBlock(p, 396, 40, 324, 900, 14, 6, 99);
  return p;
}

/** Not distinct, so it splits only because both sides have clearance. */
export function fxSolidH(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 400);
  hRule(p, 40, 460, 680, 3);
  textBlock(p, 40, 484, 680, 456);
  return p;
}

/** Ink right up against the band on both sides, as on a tight invoice. */
export function fxFilledBandH(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 400);
  fill(p, 40, 442, 680, 30, 40);
  textBlock(p, 40, 480, 680, 460);
  return p;
}

/**
 * A pale grey title band (gray 241, lighter than the ink cap of 236) carrying
 * dark text, with ink 8 px away on both sides — the Valmo "TAX INVOICE" case.
 */
export function fxPaleBandH(level = 241): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 400);
  fill(p, 40, 442, 680, 34, level);
  textLine(p, 300, 451, 160, 16, 5);
  textBlock(p, 40, 484, 680, 456);
  return p;
}

export function fxGutterOnly(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 380);
  textBlock(p, 40, 520, 680, 420);
  return p;
}

export function fxNoSeparator(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 900, 14, 6);
  return p;
}

export function fxGrid2x2(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 300, 400);
  textBlock(p, 420, 40, 300, 400, 14, 6, 31);
  textBlock(p, 40, 560, 300, 400, 14, 6, 57);
  textBlock(p, 420, 560, 300, 400, 14, 6, 83);
  return p;
}

export function fxBlankMargin(): GrayPage {
  const p = blank();
  textBlock(p, 230, 400, 300, 200);
  return p;
}

/** A dense barcode wide enough and solid enough to look like a filled band. */
export function fxBarcodeField(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 300);
  barcode(p, 50, 420, 660, 40);
  textBlock(p, 40, 520, 680, 420);
  return p;
}

export function fxQrField(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 300);
  qrBlock(p, 300, 400, 150);
  textBlock(p, 40, 620, 680, 320);
  return p;
}

/** A tight invoice table: text sits immediately above and below every rule. */
export function fxTableGrid(): GrayPage {
  const p = blank();
  const top = 40;
  const pitch = 24;
  const rows = 38;
  for (let i = 0; i <= rows; i++) hRule(p, 40, top + i * pitch, 680, 2);
  for (let i = 0; i < rows; i++) textLine(p, 44, top + i * pitch + 5, 672, 14, 100 + i);
  vRule(p, 40, top, rows * pitch, 2);
  vRule(p, 718, top, rows * pitch, 2);
  return p;
}

/** A tall solid banner at the top of a label. Content, never a separator. */
export function fxBlackBanner(): GrayPage {
  const p = blank();
  fill(p, 40, 40, 680, 70, 15);
  textBlock(p, 40, 130, 680, 300);
  return p;
}

export function fxNoiseSpecks(): GrayPage {
  const p = blank();
  textBlock(p, 230, 400, 300, 200);
  fill(p, 8, 8, 2, 2);
  fill(p, 750, 12, 3, 2);
  fill(p, 14, 988, 2, 3);
  fill(p, 744, 980, 2, 2);
  return p;
}

export function fxTextLineIsolated(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 300);
  textLine(p, 40, 354, 680, 14, 3);
  textBlock(p, 40, 382, 680, 300);
  return p;
}

export function fxHeadingCentred(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 200);
  textLine(p, 260, 246, 240, 18, 21);
  textBlock(p, 40, 270, 680, 200);
  return p;
}

export function fxFooterLine(): GrayPage {
  const p = blank();
  textBlock(p, 40, 40, 680, 300);
  textLine(p, 40, 346, 680, 12, 41);
  return p;
}

/** Flipkart shape: a bordered label box narrower than the page, then an invoice. */
export function fxBorderedBoxTb(): GrayPage {
  const p = blank();
  boxBorder(p, 150, 60, 460, 360, 3);
  textBlock(p, 170, 80, 420, 320, 14, 6, 13);
  hDashed(p, 40, 470, 680, 2);
  textBlock(p, 40, 530, 680, 420, 14, 6, 71);
  return p;
}

/**
 * Amazon shape: label LEFT, invoice RIGHT, dashed vertical between them, a
 * dashed cut-line along the bottom, blank paper below.
 */
export function fxAmazonLike(): GrayPage {
  const p = blank();
  boxBorder(p, 20, 20, 350, 460, 2);
  textBlock(p, 34, 34, 322, 120, 14, 6, 201);
  barcode(p, 60, 180, 270, 70, 202);
  textBlock(p, 34, 270, 322, 196, 14, 6, 203);
  vDashed(p, 381, 20, 460, 2);
  textBlock(p, 394, 24, 340, 80, 14, 6, 204);
  const tableTop = 120;
  for (let i = 0; i <= 14; i++) hRule(p, 394, tableTop + i * 24, 340, 2);
  for (let i = 0; i < 14; i++) textLine(p, 398, tableTop + i * 24 + 5, 332, 14, 300 + i);
  textBlock(p, 394, 470 - 20, 340, 20, 14, 6, 205);
  hDashed(p, 20, 494, 716, 2);
  return p;
}

/**
 * Valmo / Meesho shape: label edge to edge with a tall black banner, a solid
 * grid with a barcode, a much thicker rule, a product-details row, a pale
 * grey "TAX INVOICE" band, then the invoice. No dashed line, almost no
 * whitespace, content touching the page edges.
 */
export function fxValmoLike(): GrayPage {
  const p = blank();
  const L = 2;
  const R = PAGE_W - 2;
  const W = R - L;
  fill(p, L, 2, W, 70, 15);
  textLine(p, 260, 28, 240, 18, 401, 255);
  // Label grid: outer box, a middle column, two row rules, text kept 6 px off every rule.
  boxBorder(p, L, 76, W, 340, 2);
  vRule(p, 380, 76, 340, 2);
  hRule(p, L, 196, W, 2);
  hRule(p, L, 306, W, 2);
  textBlock(p, L + 8, 84, 360, 104, 14, 6, 402);
  textBlock(p, 388, 84, R - 396, 104, 14, 6, 403);
  barcode(p, 30, 214, 320, 80, 404);
  textBlock(p, 388, 214, R - 396, 84, 14, 6, 405);
  textBlock(p, L + 8, 314, W - 16, 94, 14, 6, 406);
  // The label/details boundary: much thicker than the 2 px grid rules.
  hRule(p, L, 422, W, 6);
  textBlock(p, L + 8, 434, W - 16, 34, 14, 6, 407);
  // Pale title band with its heading.
  fill(p, L, 474, W, 32, 242);
  textLine(p, 300, 482, 160, 16, 408);
  // Invoice: a tight table to the bottom of the page.
  for (let i = 0; i <= 20; i++) hRule(p, L, 512 + i * 23, W, 2);
  for (let i = 0; i < 20; i++) textLine(p, L + 6, 512 + i * 23 + 5, W - 12, 13, 500 + i);
  return p;
}
