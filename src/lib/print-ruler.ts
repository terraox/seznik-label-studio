import type { LabelDocument } from '@/lib/label-document';
import { dotsPerMm, mmToDots } from '@/lib/printer/print-spec';
import type { GridRect } from '@/lib/print-grid';
import { gridRectsToPath } from '@/lib/print-grid';

export const PRINT_RULER_LINE_MM = 0.3;

export type RulerLabel = {
  text: string;
  xMm: number;
  yMm: number;
  anchor: 'start' | 'middle' | 'end';
  small?: boolean;
};

export type PrintRulerArt = {
  inkRects: MmRect[];
  labels: RulerLabel[];
  tickBandMm: number;
  mainCellMm: number;
  smallCellMm: number;
};

type MmRect = { left: number; top: number; width: number; height: number };

type RulerInkTarget = {
  fillRect: (x: number, y: number, w: number, h: number, gray: number) => void;
};

/** 5×7 bitmap font — each char is 5 cols × 7 rows of '0'/'1'. */
const GLYPH_5X7: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '10001', '01110'],
  m: ['00000', '11011', '10101', '10101', '10101', '10101', '10101'],
  x: ['00000', '00000', '10101', '01110', '10101', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export function printRulerEnabled(doc: Pick<LabelDocument, 'settings'>): boolean {
  return doc.settings?.printRuler === true;
}

export function formatRulerMm(mm: number): string {
  const q = Math.round(mm * 10) / 10;
  return Number.isInteger(q) ? String(Math.round(q)) : q.toFixed(1);
}

export function rulerTickBandMm(widthMm: number, heightMm: number): number {
  return Math.min(2.6, Math.max(1.8, Math.min(widthMm, heightMm) * 0.08));
}

export function rulerMainCellMm(widthMm: number, heightMm: number): number {
  return Math.min(2.4, Math.max(1.7, Math.min(widthMm, heightMm) * 0.07));
}

export function rulerSmallCellMm(mainMm: number): number {
  return Math.max(1.2, mainMm * 0.62);
}

function clipRect(r: MmRect, w: number, h: number): MmRect | null {
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(w, r.left + r.width);
  const bottom = Math.min(h, r.top + r.height);
  if (right - left < 0.02 || bottom - top < 0.02) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function mmRectsToUnits(rects: MmRect[], unitsPerMm: number, lineUnits: number): GridRect[] {
  const t = Math.max(1, lineUnits);
  return rects.map((r) => ({
    left: Math.round(r.left * unitsPerMm),
    top: Math.round(r.top * unitsPerMm),
    width: Math.max(t, Math.round(r.width * unitsPerMm)),
    height: Math.max(t, Math.round(r.height * unitsPerMm)),
  }));
}

function glyphWidthCols(text: string): number {
  let w = 0;
  for (const ch of text) {
    const g = GLYPH_5X7[ch];
    if (!g) continue;
    w += g[0].length + 1;
  }
  return Math.max(0, w - 1);
}

export function blockTextSizeMm(text: string, cellMm: number): { width: number; height: number } {
  const dot = cellMm / 7;
  return { width: glyphWidthCols(text) * dot, height: cellMm };
}

/** Block digits as solid mm rects — prints reliably on thermal (no antialiased text). */
export function blockTextRectsMm(
  text: string,
  xMm: number,
  yMm: number,
  cellMm: number,
  anchor: 'start' | 'middle' | 'end' = 'start',
): MmRect[] {
  const glyphCols = 5;
  const glyphRows = 7;
  const dot = cellMm / glyphRows;
  const totalW = glyphWidthCols(text) * dot;
  let ox = xMm;
  if (anchor === 'middle') ox -= totalW / 2;
  else if (anchor === 'end') ox -= totalW;

  const rects: MmRect[] = [];
  let cx = ox;
  for (const ch of text) {
    const g = GLYPH_5X7[ch];
    if (!g) {
      cx += dot * 3;
      continue;
    }
    for (let row = 0; row < glyphRows; row++) {
      for (let col = 0; col < glyphCols; col++) {
        if (g[row][col] === '1') {
          rects.push({
            left: cx + col * dot,
            top: yMm + row * dot,
            width: dot * 0.92,
            height: dot * 0.92,
          });
        }
      }
    }
    cx += (glyphCols + 1) * dot;
  }
  return rects;
}

function numberStep(spanMm: number): number {
  if (spanMm <= 18) return 5;
  if (spanMm <= 40) return 10;
  return 10;
}

function majorNumbers(spanMm: number, step: number): number[] {
  const max = Math.round(spanMm * 10) / 10;
  const out: number[] = [0];
  for (let v = step; v < max - 0.05; v += step) out.push(v);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

function addEdgeTicks(
  rects: MmRect[],
  span: number,
  line: number,
  major: number,
  minor: number,
  axis: 'x' | 'y',
): void {
  const max = Math.max(0, Math.round(span));
  for (let mm = 0; mm <= max; mm++) {
    const len = mm % 5 === 0 ? major : minor;
    if (axis === 'x') {
      const left = Math.max(0, Math.min(span - line, mm - line / 2));
      rects.push({ left, top: 0, width: line, height: len });
    } else {
      const top = Math.max(0, Math.min(span - line, mm - line / 2));
      rects.push({ left: 0, top, width: len, height: line });
    }
  }
}

function insetLabel(
  text: string,
  xMm: number,
  yMm: number,
  cellMm: number,
  anchor: RulerLabel['anchor'],
  canvasW: number,
  canvasH: number,
  small?: boolean,
): RulerLabel {
  const size = blockTextSizeMm(text, cellMm);
  let x = xMm;
  let y = yMm;
  const pad = 0.25;
  if (anchor === 'start') x = Math.max(pad, Math.min(canvasW - size.width - pad, x));
  if (anchor === 'end') x = Math.max(size.width + pad, Math.min(canvasW - pad, x));
  if (anchor === 'middle') x = Math.max(size.width / 2 + pad, Math.min(canvasW - size.width / 2 - pad, x));
  y = Math.max(pad, Math.min(canvasH - size.height - pad, y));
  return { text, xMm: x, yMm: y, anchor, small };
}

export function buildPrintRulerGeometry(widthMm: number, heightMm: number): PrintRulerArt {
  const w = Math.max(0.1, widthMm);
  const h = Math.max(0.1, heightMm);
  const line = PRINT_RULER_LINE_MM;
  const tickBand = rulerTickBandMm(w, h);
  const mainCell = rulerMainCellMm(w, h);
  const smallCell = rulerSmallCellMm(mainCell);
  const major = tickBand;
  const minor = tickBand * 0.45;
  const numY = major + 0.25;
  const xStep = numberStep(w);
  const yStep = numberStep(h);

  const inkRects: MmRect[] = [
    { left: 0, top: 0, width: w, height: line },
    { left: 0, top: h - line, width: w, height: line },
    { left: 0, top: 0, width: line, height: h },
    { left: w - line, top: 0, width: line, height: h },
  ];
  addEdgeTicks(inkRects, w, line, major, minor, 'x');
  addEdgeTicks(inkRects, h, line, major, minor, 'y');

  const labels: RulerLabel[] = [];
  labels.push(insetLabel('0', 0.35, numY, mainCell, 'start', w, h));
  if (w >= 8) {
    labels.push(insetLabel('1', 1, numY + 0.15, smallCell, 'middle', w, h, true));
    labels.push(insetLabel('2', 2, numY + 0.15, smallCell, 'middle', w, h, true));
  }
  for (const mm of majorNumbers(w, xStep)) {
    if (mm === 0) continue;
    const anchor: RulerLabel['anchor'] = mm >= w - 0.05 ? 'end' : 'middle';
    const x = mm >= w - 0.05 ? w - 0.35 : mm;
    labels.push(insetLabel(formatRulerMm(mm), x, numY, mainCell, anchor, w, h));
  }

  const leftX = major + 0.3;
  for (const mm of majorNumbers(h, yStep)) {
    if (mm === 0) continue;
    const size = blockTextSizeMm(formatRulerMm(mm), mainCell);
    const y = Math.max(numY + mainCell + 0.3, Math.min(h - size.height - 0.3, mm - size.height / 2));
    labels.push(insetLabel(formatRulerMm(mm), leftX, y, mainCell, 'start', w, h));
  }

  for (const label of labels) {
    const cell = label.small ? smallCell : mainCell;
    for (const r of blockTextRectsMm(label.text, label.xMm, label.yMm, cell, label.anchor)) {
      const clipped = clipRect(r, w, h);
      if (clipped) inkRects.push(clipped);
    }
  }

  const clippedInk = inkRects.map((r) => clipRect(r, w, h)).filter((r): r is MmRect => r != null);

  return {
    inkRects: clippedInk,
    labels,
    tickBandMm: tickBand,
    mainCellMm: mainCell,
    smallCellMm: smallCell,
  };
}

export function printRulerLinePositionsMm(widthMm: number, heightMm: number) {
  const w = Math.max(0, Math.floor(widthMm));
  const h = Math.max(0, Math.floor(heightMm));
  return { xs: Array.from({ length: w + 1 }, (_, i) => i), ys: Array.from({ length: h + 1 }, (_, i) => i) };
}

export function printRulerLabels(widthMm: number, heightMm: number): RulerLabel[] {
  return buildPrintRulerGeometry(widthMm, heightMm).labels;
}

export function printRulerRects(
  widthMm: number,
  heightMm: number,
  unitsPerMm: number,
  lineUnits: number,
): GridRect[] {
  return mmRectsToUnits(buildPrintRulerGeometry(widthMm, heightMm).inkRects, unitsPerMm, lineUnits);
}

export function printRulerRectsDots(widthMm: number, heightMm: number, dpi: number): GridRect[] {
  return printRulerRects(widthMm, heightMm, dotsPerMm(dpi), mmToDots(PRINT_RULER_LINE_MM, dpi));
}

export function printRulerPathDots(
  widthMm: number,
  heightMm: number,
  dpi: number,
  shiftDotsX = 0,
  shiftDotsY = 0,
): string {
  return gridRectsToPath(printRulerRectsDots(widthMm, heightMm, dpi), shiftDotsX, shiftDotsY);
}

export function drawPrintRuler(
  target: RulerInkTarget,
  widthMm: number,
  heightMm: number,
  dpi: number,
  scale = 1,
): void {
  const s = scale;
  const lineUnits = mmToDots(PRINT_RULER_LINE_MM, dpi);
  const dpm = dotsPerMm(dpi);
  for (const r of mmRectsToUnits(buildPrintRulerGeometry(widthMm, heightMm).inkRects, dpm, lineUnits)) {
    target.fillRect(r.left * s, r.top * s, r.width * s, r.height * s, 0);
  }
}
