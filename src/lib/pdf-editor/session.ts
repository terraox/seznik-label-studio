import type { EditorColorMode } from '@/lib/editor/image-mono';

/** 72 PDF points per inch. */
export const PT_PER_INCH = 72;

export type PdfColorMode = EditorColorMode;
export const MM_PER_INCH = 25.4;
export const PT_PER_MM = PT_PER_INCH / MM_PER_INCH;

export type PageScope =
  | { mode: 'this' }
  | { mode: 'all' }
  | { mode: 'range'; start: number; end: number };

export type OutputSizeKind = 'custom' | '3x4' | '3x5' | '4x4' | '4x6';

export type OutputSize = {
  kind: OutputSizeKind;
  widthMm: number;
  heightMm: number;
};

export const OUTPUT_SIZE_PRESETS: { kind: Exclude<OutputSizeKind, 'custom'>; label: string; widthMm: number; heightMm: number }[] =
  [
    { kind: '3x4', label: '3"×4" / 76×100mm', widthMm: 76, heightMm: 100 },
    { kind: '3x5', label: '3"×5" / 76×130mm', widthMm: 76, heightMm: 130 },
    { kind: '4x4', label: '4"×4" / 100×100mm', widthMm: 100, heightMm: 100 },
    { kind: '4x6', label: '4"×6" / 101.6×152.4mm', widthMm: 101.6, heightMm: 152.4 },
  ];

export const DEFAULT_OUTPUT_SIZE: OutputSize = {
  kind: 'custom',
  widthMm: 50,
  heightMm: 30,
};

export type NinePoint =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const NINE_POINTS: NinePoint[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export function ninePointToOffsetNorm(anchor: NinePoint): { x: number; y: number } {
  const col = anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 1 : 0.5;
  const row = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : 0.5;
  return { x: col, y: row };
}

export type PdfCrop = {
  scope: PageScope;
  originNorm: { x: number; y: number };
  sizeNorm?: { w: number; h: number };
};

/** Keep the crop window inside the page. Origin and size are fractions of the page. */
export function clampCropNorm(
  origin: { x: number; y: number },
  size?: { w: number; h: number },
): { originNorm: { x: number; y: number }; sizeNorm: { w: number; h: number } } {
  const w = Math.min(1, Math.max(0.05, size?.w && size.w > 0 ? size.w : 1));
  const h = Math.min(1, Math.max(0.05, size?.h && size.h > 0 ? size.h : 1));
  const x = Math.min(1 - w, Math.max(0, origin.x));
  const y = Math.min(1 - h, Math.max(0, origin.y));
  return { originNorm: { x, y }, sizeNorm: { w, h } };
}

export type PdfWatermark = {
  scope: PageScope;
  type: 'text' | 'image';
  layout: 'stamp' | 'tiled';
  opacity: number;
  rotationDeg: number;
  text?: { content: string; fontSizePt: number; color: string };
  image?: {
    sourceUri: string;
    tileUri: string;
    tilePx: { w: number; h: number };
  };
  stamp?: {
    anchor: NinePoint;
    offsetNorm: { x: number; y: number };
    sizeNorm: number;
  };
  tiled?: {
    spacingNorm: { x: number; y: number };
    staggered?: boolean;
  };
};

export type PdfEditSession = {
  sourceUri: string;
  sourceName: string;
  pageCount: number;
  pageSizesPt: { w: number; h: number }[];
  currentPageIndex: number;
  outputSize: OutputSize;
  crop: PdfCrop | null;
  rotationByPage: number[];
  sharpnessByPage: number[];
  watermark: PdfWatermark | null;
  /** Original keeps color. B & W thresholds. Halftone uses ordered dither on export. */
  colorMode: PdfColorMode;
  /** Per-page color. Missing entries use `colorMode`. */
  colorModeByPage?: PdfColorMode[];
};

export function pageColorMode(session: PdfEditSession, pageIndex: number): PdfColorMode {
  return session.colorModeByPage?.[pageIndex] ?? session.colorMode ?? 'Original';
}

export type PdfPrintSelection =
  | { mode: 'current' }
  | { mode: 'range'; start: number; end: number }
  | { mode: 'custom'; pages: number[] }
  | { mode: 'even' }
  | { mode: 'odd' };

export type PdfBoxPts = { x: number; y: number; w: number; h: number; fits: boolean };

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export function ptToMm(pt: number): number {
  return pt / PT_PER_MM;
}

/**
 * Inclusive 1-based range. Out-of-range values are clamped.
 * If start > end after clamp, they are swapped and `error` is set.
 */
export function parsePageRange(
  startRaw: string,
  endRaw: string,
  pageCount: number,
): { start: number; end: number; error?: string } {
  const max = Math.max(1, pageCount);
  const parseOne = (raw: string, fallback: number) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(1, n));
  };
  let start = parseOne(startRaw, 1);
  let end = parseOne(endRaw, max);
  let error: string | undefined;
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
    error = 'Range start was after end; clamped to a valid inclusive range.';
  }
  return { start, end, error };
}

export function resolveScopeIndices(
  scope: PageScope,
  pageCount: number,
  currentPageIndex: number,
): number[] {
  if (pageCount <= 0) return [];
  if (scope.mode === 'this') {
    const i = Math.min(pageCount - 1, Math.max(0, currentPageIndex));
    return [i];
  }
  if (scope.mode === 'all') {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const { start, end } = parsePageRange(String(scope.start), String(scope.end), pageCount);
  const out: number[] = [];
  for (let i = start - 1; i <= end - 1; i++) out.push(i);
  return out;
}

export function cropWindowFitsPage(
  pageWpt: number,
  pageHpt: number,
  output: OutputSize,
): boolean {
  const w = mmToPt(output.widthMm);
  const h = mmToPt(output.heightMm);
  return w <= pageWpt + 0.01 && h <= pageHpt + 0.01;
}

/**
 * Crop window in PDF user space (origin bottom-left).
 * `originNorm` is top-left of the window, 0–1 of the original MediaBox.
 */
export function cropWindowPts(
  page: { w: number; h: number },
  output: OutputSize,
  originNorm: { x: number; y: number },
  sizeNorm?: { w: number; h: number },
): PdfBoxPts {
  const hasNorm = Boolean(sizeNorm && sizeNorm.w > 0 && sizeNorm.h > 0);
  const clamped = hasNorm ? clampCropNorm(originNorm, sizeNorm) : { originNorm, sizeNorm: { w: 1, h: 1 } };
  let w: number;
  let h: number;
  if (sizeNorm && sizeNorm.w > 0 && sizeNorm.h > 0) {
    w = Math.min(page.w, Math.max(10, clamped.sizeNorm.w * page.w));
    h = Math.min(page.h, Math.max(10, clamped.sizeNorm.h * page.h));
  } else {
    w = mmToPt(output.widthMm);
    h = mmToPt(output.heightMm);
    if (w > page.w || h > page.h) {
      const scale = Math.min(page.w / Math.max(1, w), page.h / Math.max(1, h));
      w = Math.max(10, w * scale);
      h = Math.max(10, h * scale);
    }
  }
  const maxX = Math.max(0, page.w - w);
  const maxYTop = Math.max(0, page.h - h);
  const x = Math.min(maxX, Math.max(0, clamped.originNorm.x * page.w));
  const yTop = Math.min(maxYTop, Math.max(0, clamped.originNorm.y * page.h));
  const y = Math.max(0, page.h - yTop - h);
  return { x, y, w, h, fits: true };
}

/** Stamp size/position in PDF points of the *original* page, after crop boxes are set. */
export function stampRectInCropSpace(
  crop: PdfBoxPts,
  stamp: { offsetNorm: { x: number; y: number }; sizeNorm: number },
): { x: number; y: number; w: number; h: number } {
  const size = Math.min(0.95, Math.max(0.08, stamp.sizeNorm));
  const w = crop.w * size;
  const h = Math.max(20, w * 0.35);
  const ox = Math.min(1, Math.max(0, stamp.offsetNorm.x));
  const oy = Math.min(1, Math.max(0, stamp.offsetNorm.y));
  const maxX = Math.max(0, crop.w - w);
  const maxY = Math.max(0, crop.h - h);
  const x = crop.x + ox * maxX;
  const yTop = oy * maxY;
  const y = crop.y + (crop.h - yTop - h);
  return { x, y, w, h };
}

export function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

export function sharpnessAmount(slider0to100: number): number {
  const t = Math.min(100, Math.max(0, slider0to100)) / 100;
  return t * 2.5;
}

export function shouldRasterizePage(sharpness: number): boolean {
  return sharpness > 0;
}

export function sharpness0CropBoxesEqual(media: PdfBoxPts, crop: PdfBoxPts): boolean {
  return media.x === crop.x && media.y === crop.y && media.w === crop.w && media.h === crop.h;
}

/**
 * Tile repeat count from spacing vs the post-crop page, never from source image pixels.
 */
export function tiledRepeatCount(
  spacingNorm: { x: number; y: number },
): { cols: number; rows: number } {
  const sx = Math.min(0.8, Math.max(0.08, spacingNorm.x));
  const sy = Math.min(0.8, Math.max(0.08, spacingNorm.y));
  return {
    cols: Math.max(1, Math.round(1 / sx)),
    rows: Math.max(1, Math.round(1 / sy)),
  };
}

/**
 * Custom page list: "1, 3, 5" or "1 3 5". 1-based, unique, sorted.
 * Out-of-range or non-numeric tokens set `error` and return no pages.
 */
export function parseCustomPageList(
  raw: string,
  pageCount: number,
): { pages: number[]; error?: string } {
  const max = Math.max(0, pageCount);
  const parts = raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return { pages: [], error: 'Enter at least one page number.' };
  const pages = new Set<number>();
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return { pages: [], error: `"${part}" is not a page number.` };
    }
    const n = Number.parseInt(part, 10);
    if (n < 1 || n > max) {
      return { pages: [], error: `Page ${n} is outside 1–${Math.max(1, max)}.` };
    }
    pages.add(n);
  }
  return { pages: [...pages].sort((a, b) => a - b) };
}

/** 0-based page indices for a print selection. Even/odd use 1-based page numbers. */
export function resolvePrintPageIndices(
  selection: PdfPrintSelection,
  pageCount: number,
  currentPageIndex: number,
): number[] {
  if (pageCount <= 0) return [];
  if (selection.mode === 'current') {
    const i = Math.min(pageCount - 1, Math.max(0, currentPageIndex));
    return [i];
  }
  if (selection.mode === 'range') {
    return resolveScopeIndices(
      { mode: 'range', start: selection.start, end: selection.end },
      pageCount,
      currentPageIndex,
    );
  }
  if (selection.mode === 'custom') {
    return selection.pages
      .filter((n) => n >= 1 && n <= pageCount)
      .map((n) => n - 1)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .sort((a, b) => a - b);
  }
  const out: number[] = [];
  const start = selection.mode === 'even' ? 1 : 0;
  for (let i = start; i < pageCount; i += 2) out.push(i);
  return out;
}

export function defaultWatermark(): PdfWatermark {
  return {
    scope: { mode: 'this' },
    type: 'text',
    layout: 'stamp',
    opacity: 0.45,
    rotationDeg: -30,
    text: { content: 'WATERMARK', fontSizePt: 22, color: '#DC2626' },
    stamp: {
      anchor: 'center',
      offsetNorm: { x: 0.5, y: 0.5 },
      sizeNorm: 0.42,
    },
    tiled: { spacingNorm: { x: 0.24, y: 0.24 }, staggered: true },
  };
}
