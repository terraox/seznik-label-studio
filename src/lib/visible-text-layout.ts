import { useSyncExternalStore } from 'react';

import { needsComplexTextShaping, resolveEditorFontFamily } from '@/lib/fonts/text-font-family';
import {
  computeWrappedLines,
  measureTextWidthMm,
  ptToMm,
  textHorizontalPaddingMm,
  textLineBoxHeightMm,
  textVerticalPaddingMm,
  textWrapWidthMm,
  type ComputeTextElementHeightParams,
} from '@/lib/text-metrics';

export type VisibleTextParams = ComputeTextElementHeightParams;

const remembered = new Map<string, string[]>();
let revision = 0;
const listeners = new Set<() => void>();

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The face the text is really drawn in. Callers pass either the stored font name or the
 * already-resolved face key; both must give one key and one measurer, or the frame height
 * is computed from different lines than the ones drawn and the extra lines get clipped.
 */
function layoutFamily(opts: VisibleTextParams): string {
  const stored = opts.fontFamily;
  const resolved = resolveEditorFontFamily(opts.text, stored);
  if (resolved) return resolved;
  return stored && stored !== 'Default' && stored !== 'Barcode' ? stored : '';
}

/** Same key the preview stores and the printer reads. */
export function visibleTextKey(opts: VisibleTextParams, family: string = layoutFamily(opts)): string {
  return [
    opts.text,
    roundTenth(opts.fontSize),
    roundTenth(opts.widthMm),
    opts.autoWrapping ?? 'Word',
    opts.lineSpacing ?? '1.0',
    roundTenth(opts.charSpacing ?? 0),
    opts.bold ? 1 : 0,
    opts.verticalDisplay ? 1 : 0,
    family,
  ].join('\u001f');
}

function publish() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

/** Lines React Native actually drew. Print uses these so the sticker matches the preview. */
export function rememberVisibleLines(key: string, lines: string[]) {
  const clean = lines.length > 0 ? lines : [''];
  const prev = remembered.get(key);
  if (prev && prev.length === clean.length && prev.every((line, index) => line === clean[index])) return;
  remembered.set(key, clean);
  publish();
}

/**
 * Lines React Native reports, cleaned for the cache. Native text can end a line in "\n", and
 * re-joining with "\n" turns that into a blank line, which then comes back as one more line
 * on the next layout. Only blank lines the typed text really has are kept.
 */
export function cleanNativeLines(nativeLines: string[], sourceText: string): string[] {
  const allowedBlank = sourceText.split('\n').filter((part) => part.length === 0).length;
  let blanks = 0;
  const out: string[] = [];
  for (const raw of nativeLines) {
    const line = raw.replace(/\r?\n+$/, '');
    if (line.length === 0) {
      blanks += 1;
      if (blanks > allowedBlank) continue;
    }
    out.push(line);
  }
  return out;
}

export function useVisibleTextRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
    () => revision,
  );
}

type SkiaFontLike = {
  measureText: (sample: string) => { width: number };
  getGlyphIDs?: (sample: string) => number[];
  getGlyphWidths?: (ids: number[]) => number[];
};
type SkiaModuleLike = {
  matchFont?: (style: Record<string, unknown>) => SkiaFontLike;
  Skia?: { Font: (face: unknown, size: number) => SkiaFontLike };
};

let skiaModule: SkiaModuleLike | null | undefined;
const fontCache = new Map<string, SkiaFontLike | null>();
const widthCache = new Map<string, number | null>();
const WIDTH_CACHE_MAX = 4000;

function loadSkia(): SkiaModuleLike | null {
  if (skiaModule !== undefined) return skiaModule;
  try {
    skiaModule = require('@shopify/react-native-skia') as SkiaModuleLike;
  } catch {
    skiaModule = null;
  }
  return skiaModule;
}

/** The decoded face print draws with (bold swap included). Null until it has been loaded. */
function embeddedFace(family: string | undefined, bold: boolean): unknown {
  if (!family) return null;
  try {
    const map = require('@/printing/raster/print-typeface-map') as {
      getPrintTypeface: (family?: string, bold?: boolean) => unknown;
    };
    return map.getPrintTypeface(family, bold) ?? null;
  } catch {
    return null;
  }
}

const faceRequests = new Set<string>();

/**
 * matchFont only sees system fonts, so a library / downloaded / Indic face measures as the
 * default face until its file is decoded. Load it once, then drop the measurements taken
 * without it and publish so every text re-wraps with the real widths.
 */
function requestFace(family: string) {
  if (faceRequests.has(family)) return;
  faceRequests.add(family);
  void (async () => {
    try {
      const mod = require('@/printing/raster/print-typeface') as {
        ensurePrintTypefaces: () => Promise<void>;
        registerPrintTypeface: (key: string, uri: string) => Promise<boolean>;
      };
      await mod.ensurePrintTypefaces();
      const store = require('@/stores/installed-font-store') as {
        useInstalledFontStore: {
          getState: () => { items: { familyKey?: string; fileUri?: string }[] };
        };
      };
      const record = store.useInstalledFontStore
        .getState()
        .items.find((font) => font.familyKey === family);
      if (record?.fileUri) await mod.registerPrintTypeface(family, record.fileUri);
    } catch {
      // No native Skia (tests) or a bad file: keep the fallback measurer.
    } finally {
      fontCache.clear();
      widthCache.clear();
      publish();
    }
  })();
}

function skiaFont(fontSizePt: number, bold: boolean, fontFamily?: string): SkiaFontLike | null {
  const face = embeddedFace(fontFamily, bold);
  if (fontFamily && !face) requestFace(fontFamily);
  // The face is part of the key so a measurement taken before it loaded is never reused.
  const key = `${fontFamily ?? ''}|${fontSizePt}|${bold ? 1 : 0}|${face ? 'f' : 'm'}`;
  const hit = fontCache.get(key);
  if (hit !== undefined) return hit;
  let font: SkiaFontLike | null = null;
  try {
    const skia = loadSkia();
    if (face && skia?.Skia?.Font) {
      font = skia.Skia.Font(face, fontSizePt);
    } else if (skia?.matchFont) {
      font = skia.matchFont({
        ...(fontFamily ? { fontFamily } : {}),
        fontSize: fontSizePt,
        fontWeight: bold ? '600' : '400',
      });
    }
  } catch {
    font = null;
  }
  fontCache.set(key, font);
  return font;
}

/**
 * Width of `text` in the same face the editor Text uses.
 * Returns null when Skia is not available (unit tests).
 * The font and each measured width are cached: a width drag re-wraps on every frame and the
 * same words come back again and again.
 */
function skiaWidthMm(
  text: string,
  fontSizePt: number,
  charSpacingMm: number,
  bold: boolean,
  fontFamily?: string,
): number | null {
  if (!text) return 0;
  const faced = embeddedFace(fontFamily, bold) ? 'f' : 'm';
  const key = `${fontFamily ?? ''}|${fontSizePt}|${bold ? 1 : 0}|${faced}|${charSpacingMm}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const value = measureSkiaWidthMm(text, fontSizePt, charSpacingMm, bold, fontFamily);
  if (widthCache.size >= WIDTH_CACHE_MAX) widthCache.clear();
  widthCache.set(key, value);
  return value;
}

function measureSkiaWidthMm(
  text: string,
  fontSizePt: number,
  charSpacingMm: number,
  bold: boolean,
  fontFamily?: string,
): number | null {
  try {
    const skia = loadSkia();
    if (!skia) return null;
    if (needsComplexTextShaping(text)) {
      const shaped = require('@/printing/raster/skia-shaped-text') as {
        measureShapedTextWidth: (
          mod: unknown,
          sample: string,
          style: { fontSizeDots: number; bold?: boolean; family?: string; ink: number; letterSpacingDots?: number },
        ) => number | null;
      };
      const letterSpacingDots = charSpacingMm > 0 ? (charSpacingMm * 72) / 25.4 : 0;
      const width = shaped.measureShapedTextWidth(skia, text, {
        fontSizeDots: fontSizePt,
        bold,
        family: fontFamily,
        ink: 0,
        letterSpacingDots,
      });
      if (width != null && width > 0) return width * (25.4 / 72);
    }
    const font = skiaFont(fontSizePt, bold, fontFamily);
    if (!font) return null;
    // Pen advance, not ink bounds: the screen text lays out by advance, and ink width drops
    // side bearings (a trailing space measures ~0), which lets a line run wider than its box.
    let px = 0;
    try {
      const ids = font.getGlyphIDs?.(text);
      const widths = ids && ids.length > 0 ? font.getGlyphWidths?.(ids) : undefined;
      if (widths) for (let i = 0; i < widths.length; i += 1) px += widths[i];
    } catch {
      px = 0;
    }
    if (!(px > 0)) px = font.measureText(text).width;
    if (!(px > 0)) return null;
    const spacingPx = ((charSpacingMm * 72) / 25.4) * text.length;
    return (px + spacingPx) * (25.4 / 72);
  } catch {
    return null;
  }
}

function lineWidthMm(
  text: string,
  fontSize: number,
  charSpacing: number,
  bold: boolean,
  fontFamily?: string,
): number {
  const measured = skiaWidthMm(text, fontSize, charSpacing, bold, fontFamily);
  if (measured != null && measured > 0) return measured;
  return measureTextWidthMm(text, fontSize, charSpacing, bold, fontFamily);
}

/** Lines the preview shows and the printer must draw. */
export function visibleWrappedLines(opts: VisibleTextParams): string[] {
  return wrappedLinesFor(opts, layoutFamily(opts));
}

/**
 * The screen text measures a hair differently from Skia. Wrapping a little early means the screen
 * never has to break a line that was kept whole here, so the frame height, the preview and the
 * printer all see the same lines.
 */
function wrapSlackMm(fontSizePt: number): number {
  return Math.max(0.2, ptToMm(fontSizePt) * 0.07);
}

function wrappedLinesFor(opts: VisibleTextParams, family: string): string[] {
  const key = visibleTextKey(opts, family);
  const cached = remembered.get(key);
  if (cached) return cached;
  const inner = textWrapWidthMm(opts.widthMm, opts.fontSize, false);
  const limit = Math.max(0.5, inner - wrapSlackMm(opts.fontSize));
  const fontSize = opts.fontSize;
  const charSpacing = opts.charSpacing ?? 0;
  const bold = opts.bold ?? false;
  const fontFamily = family || undefined;
  return computeWrappedLines({
    text: opts.text,
    fontSize,
    widthMm: limit,
    autoWrapping: opts.autoWrapping,
    charSpacing,
    bold,
    verticalDisplay: opts.verticalDisplay,
    fontFamily,
    measureWidth: (sample) => lineWidthMm(sample, fontSize, charSpacing, bold, fontFamily),
  });
}

/** Frame height that keeps every wrapped line fully visible. */
export function visibleTextHeightMm(opts: VisibleTextParams): number {
  const family = layoutFamily(opts);
  const lines = wrappedLinesFor(opts, family);
  const lineH = textLineBoxHeightMm(opts.fontSize, opts.lineSpacing, family || undefined, opts.text);
  const pad = textVerticalPaddingMm(opts.fontSize);
  return Math.max(2.2, pad * 2 + lineH * Math.max(1, lines.length));
}

/** Frame height for `lineCount` lines drawn at `opts`. Same line box and padding as visibleTextHeightMm. */
export function heightForLineCountMm(opts: VisibleTextParams, lineCount: number): number {
  const family = layoutFamily(opts);
  const lineH = textLineBoxHeightMm(opts.fontSize, opts.lineSpacing, family || undefined, opts.text);
  const pad = textVerticalPaddingMm(opts.fontSize);
  return Math.max(2.2, pad * 2 + lineH * Math.max(1, lineCount));
}

export type LiveLayoutBank = {
  /** Smallest box width (mm) each layout is valid from, ascending. */
  starts: number[];
  /** Frame height (mm) of each layout. */
  heights: number[];
  /** Wrapped lines of each layout. */
  lines: string[][];
  /** Widest box width covered (mm). */
  maxWidthMm: number;
};

/**
 * Every distinct wrap the box can take between `minWidthMm` and `maxWidthMm`. Prefetched while
 * idle so a width drag can look up frame height on the UI thread with no measure per frame.
 * Widths between two steps use the narrower step's layout, so a line is never wider than its box.
 */
export function buildLiveLayoutBank(
  opts: Omit<VisibleTextParams, 'widthMm'>,
  minWidthMm: number,
  maxWidthMm: number,
  stepMm = 0.5,
): LiveLayoutBank {
  const starts: number[] = [];
  const heights: number[] = [];
  const lines: string[][] = [];
  const hi = Math.max(minWidthMm, maxWidthMm);
  let previous: string[] | null = null;
  for (let w = minWidthMm; w <= hi + 1e-6; w += stepMm) {
    const at = { ...opts, widthMm: w };
    const wrapped = visibleWrappedLines(at);
    if (
      previous &&
      previous.length === wrapped.length &&
      previous.every((line, index) => line === wrapped[index])
    ) {
      continue;
    }
    previous = wrapped;
    starts.push(w);
    lines.push(wrapped);
    heights.push(heightForLineCountMm(at, wrapped.length));
  }
  return { starts, heights, lines, maxWidthMm: hi };
}

/**
 * Selection frame for auto-height text. Width is the box the user set (typing
 * and creation already fit it to the words); height follows the wrapped lines.
 * Only a missing width falls back to hugging the words.
 */
export function huggedTextFrameMm(
  opts: VisibleTextParams & { storedWidth: number },
): { width: number; height: number } {
  const fontSize = opts.fontSize > 0 ? opts.fontSize : 12;
  const inset = textHorizontalPaddingMm(fontSize) * 2;
  if (opts.storedWidth > 0 || opts.verticalDisplay) {
    const width = opts.storedWidth > 0 ? opts.storedWidth : inset + 4;
    return { width, height: visibleTextHeightMm({ ...opts, widthMm: width }) };
  }
  const rawLines = opts.text.length > 0 ? opts.text.split('\n') : [''];
  let longest = 0;
  for (const line of rawLines) {
    longest = Math.max(
      longest,
      lineWidthMm(line, fontSize, opts.charSpacing ?? 0, opts.bold ?? false, opts.fontFamily),
    );
  }
  const width = Math.max(4, longest + inset + 0.6);
  return { width, height: visibleTextHeightMm({ ...opts, widthMm: width }) };
}
