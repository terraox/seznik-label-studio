import { useSyncExternalStore } from 'react';

import { needsComplexTextShaping, resolveEditorFontFamily } from '@/lib/fonts/text-font-family';
import {
  computeWrappedLines,
  measureTextWidthMm,
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
export function visibleTextKey(opts: VisibleTextParams): string {
  return [
    opts.text,
    roundTenth(opts.fontSize),
    roundTenth(opts.widthMm),
    opts.autoWrapping ?? 'Word',
    opts.lineSpacing ?? '1.0',
    roundTenth(opts.charSpacing ?? 0),
    opts.bold ? 1 : 0,
    opts.verticalDisplay ? 1 : 0,
    layoutFamily(opts),
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

/**
 * Width of `text` in the same face the editor Text uses.
 * Returns null when Skia is not available (unit tests).
 */
function skiaWidthMm(
  text: string,
  fontSizePt: number,
  charSpacingMm: number,
  bold: boolean,
  fontFamily?: string,
): number | null {
  if (!text) return 0;
  try {
    const skia = require('@shopify/react-native-skia') as {
      matchFont?: (style: Record<string, unknown>) => { measureText: (sample: string) => { width: number } };
    };
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
    if (!skia.matchFont) return null;
    const font = skia.matchFont({
      ...(fontFamily ? { fontFamily } : {}),
      fontSize: fontSizePt,
      fontWeight: bold ? '600' : '400',
    });
    const px = font.measureText(text).width;
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
  const key = visibleTextKey(opts);
  const cached = remembered.get(key);
  if (cached) return cached;
  const inner = textWrapWidthMm(opts.widthMm, opts.fontSize, false);
  const limit = Math.max(0.5, inner);
  const fontSize = opts.fontSize;
  const charSpacing = opts.charSpacing ?? 0;
  const bold = opts.bold ?? false;
  const fontFamily = layoutFamily(opts) || undefined;
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
  const lines = visibleWrappedLines(opts);
  const lineH = textLineBoxHeightMm(opts.fontSize, opts.lineSpacing, layoutFamily(opts) || undefined, opts.text);
  const pad = textVerticalPaddingMm(opts.fontSize);
  return Math.max(2.2, pad * 2 + lineH * Math.max(1, lines.length));
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
