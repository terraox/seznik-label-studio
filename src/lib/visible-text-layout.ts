import { useSyncExternalStore } from 'react';

import { needsComplexTextShaping } from '@/lib/fonts/text-font-family';
import {
  computeWrappedLines,
  measureTextWidthMm,
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
    opts.fontFamily ?? '',
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
  // A line that measures exactly the content width still wraps in React Native.
  const limit = Math.max(0.5, inner * 0.96);
  const fontSize = opts.fontSize;
  const charSpacing = opts.charSpacing ?? 0;
  const bold = opts.bold ?? false;
  const fontFamily = opts.fontFamily;
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
  const lineH = textLineBoxHeightMm(opts.fontSize, opts.lineSpacing, opts.fontFamily, opts.text);
  const pad = textVerticalPaddingMm(opts.fontSize);
  return Math.max(2.2, pad * 2 + lineH * Math.max(1, lines.length));
}
