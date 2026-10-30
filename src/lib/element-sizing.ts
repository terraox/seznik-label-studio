import { DEFAULT_TIME_STATE, TIME_DISPLAY_SAMPLE } from '@/components/editor/types';
import { insetBorderBox } from '@/lib/border-geometry';
import { elementSizeMm, mmToPt, ptToMm, textBlockHeightMm, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { visibleTextHeightMm } from '@/lib/visible-text-layout';
import { isRatTailGeometry, ratTailBodyRectMm, scaleMediaGeometry } from '@/lib/media-geometry';
import { clampToLabelBounds } from '@/lib/editor/label-bounds';
import { roundMm } from '@/lib/editor/engine';
import { DEFAULT_TEXT_FONT_PT } from '@/components/editor/types';
import {
  heightForWrappedTextMm,
  measureTextWidthMm,
  textHorizontalPaddingMm,
  textVerticalPaddingMm,
} from '@/lib/text-metrics';
import { formatDataSourceColumn } from '@/lib/editor/data-source-display';
import { ensureTableCells } from '@/lib/editor/table-cells';
import { applySerialOffset } from '@/lib/serial-content';
import { useSettingsStore } from '@/stores/settings-store';
export { computeTextElementHeightMm, computeWrappedLines, heightForWrappedTextMm, measureTextWidthMm } from '@/lib/text-metrics';
export { textBlockHeightMm } from '@/lib/label-document';

type TextLikeElement = Extract<LabelElement, { type: 'text' } | { type: 'degrees' }>;

function textRawContent(el: TextLikeElement): string {
  if (el.contentType === 'Data Source' && el.columnNameContent) {
    const showColumnName = useSettingsStore.getState().editor.showColumnName;
    return formatDataSourceColumn(el.columnNameContent, showColumnName);
  }
  const base = 'text' in el ? el.text : el.content;
  if (el.contentType === 'Degrees') {
    const offset = 'degreesOffset' in el && typeof el.degreesOffset === 'number' ? el.degreesOffset : 1;
    return applySerialOffset(base, offset, 1);
  }
  return base;
}

const CONTENT_FIT_KEYS = new Set([
  'text',
  'content',
  'fontSize',
  'fontFamily',
  'charSpacing',
  'lineSpacing',
  'bold',
  'verticalDisplay',
  'autoWrapping',
  'contentType',
  'columnNameContent',
  'degreesOffset',
]);

/** Changing these may grow width to hug the typed string. */
const CONTENT_GROW_KEYS = new Set([
  'text',
  'content',
  'contentType',
  'columnNameContent',
  'degreesOffset',
  'verticalDisplay',
]);

/**
 * Size the text box to the entered string with even side insets (reference layout).
 * Grows with typing; wraps only when the label edge is reached.
 */
export function fitTextBoxToContent(
  el: TextLikeElement,
  canvas: { widthMm: number; heightMm: number },
): { width: number; height: number } {
  const raw = textRawContent(el);
  const fontSize = typeof el.fontSize === 'number' ? el.fontSize : 12;
  const charSpacing = el.charSpacing ?? 0;
  const bold = el.bold ?? false;
  const insetX = textHorizontalPaddingMm(fontSize);
  const minW = Math.max(4, ptToMm(fontSize) * 1.4 + insetX * 2);
  const maxW = Math.max(minW, canvas.widthMm - Math.max(0, el.left));
  const maxH = Math.max(minW, canvas.heightMm - Math.max(0, el.top));

  if (el.verticalDisplay) {
    const chars = raw.length > 0 ? raw.replace(/\n/g, '').split('') : [''];
    const glyphW = Math.max(
      measureTextWidthMm(raw.length ? raw.replace(/\n/g, '') : 'W', fontSize, charSpacing, bold, el.fontFamily) /
        Math.max(1, chars.length),
      measureTextWidthMm('W', fontSize, 0, bold, el.fontFamily),
    );
    const width = roundMm(Math.min(maxW, Math.max(minW, glyphW + insetX * 2)));
    const height = visibleTextHeightMm({
      text: raw,
      fontSize,
      widthMm: width,
      autoWrapping: el.autoWrapping ?? 'Word',
      lineSpacing: el.lineSpacing ?? '1.0',
      charSpacing,
      bold,
      verticalDisplay: true,
      fontFamily: el.fontFamily,
    });
    return {
      width,
      height: roundMm(Math.min(maxH, Math.max(textVerticalPaddingMm(fontSize) * 2 + 2, height))),
    };
  }

  const explicitLines = raw.length > 0 ? raw.split('\n') : [''];
  let longestMm = 0;
  for (const line of explicitLines) {
    longestMm = Math.max(longestMm, measureTextWidthMm(line, fontSize, charSpacing, bold, el.fontFamily));
  }

  // Margin so rounding and the on-device font measure never push the last word onto a new line.
  const width = roundMm(Math.min(maxW, Math.max(minW, longestMm + insetX * 2 + TEXT_FIT_SLACK_MM)));
  const needsWrap = longestMm + insetX * 2 > maxW + 0.05;
  const heightMm = visibleTextHeightMm({
    text: raw,
    fontSize,
    widthMm: width,
    autoWrapping: needsWrap
      ? el.autoWrapping === 'Close'
        ? 'Word'
        : el.autoWrapping ?? 'Word'
      : 'Word',
    lineSpacing: el.lineSpacing ?? '1.0',
    charSpacing,
    bold,
    verticalDisplay: false,
    fontFamily: el.fontFamily,
  });
  return {
    width,
    height: roundMm(Math.min(maxH, Math.max(textVerticalPaddingMm(fontSize) * 2 + 2, heightMm))),
  };
}

/** Grow a text frame's height so wrapped lines stay visible at `widthMm`. */
export function growTextFrameHeightForWidth(
  el: TextLikeElement,
  widthMm: number,
  minHeightMm: number,
): number {
  return roundMm(
    heightForWrappedTextMm({
      text: textRawContent(el),
      fontSize: el.fontSize,
      widthMm,
      autoWrapping: 'Word',
      lineSpacing: el.lineSpacing ?? '1.0',
      charSpacing: el.charSpacing ?? 0,
      bold: el.bold ?? false,
      verticalDisplay: el.verticalDisplay ?? false,
      fontFamily: el.fontFamily,
      minHeightMm,
    }),
  );
}

/** Merge typography patches and reflow/clear height for auto-text-height elements. */
export function mergeTextElementPatch(
  el: TextLikeElement,
  updates: Record<string, unknown>,
  canvas?: { widthMm: number; heightMm: number },
): LabelElement {
  return mergeTextElementPatchCore(el, updates, canvas);
}

function mergeTextElementPatchCore(
  el: TextLikeElement,
  updates: Record<string, unknown>,
  canvas?: { widthMm: number; heightMm: number },
): LabelElement {
  let merged = { ...el, ...updates } as TextLikeElement;

  if (updates.contentType === 'Degrees' && !('degreesOffset' in merged)) {
    merged = { ...merged, degreesOffset: 1 } as TextLikeElement;
  }

  const typographyKeys = new Set([
    'text',
    'content',
    'fontSize',
    'fontFamily',
    'width',
    'charSpacing',
    'lineSpacing',
    'autoWrapping',
    'verticalDisplay',
    'autoTextHeight',
    'bold',
    'contentType',
    'columnNameContent',
    'degreesOffset',
  ]);
  const touchesTypography = Object.keys(updates).some((key) => typographyKeys.has(key));
  if (!touchesTypography) {
    return merged as LabelElement;
  }

  const widthInPatch = 'width' in updates && typeof updates.width === 'number';
  const heightInPatch = 'height' in updates && typeof updates.height === 'number';

  // Close is one line, never wrapped: the frame hugs that line (a dragged width is kept) and
  // is exactly one line tall, instead of keeping the multi-line shape it had before.
  if (merged.autoWrapping === 'Close' && !merged.verticalDisplay && !heightInPatch) {
    const raw = textRawContent(merged).replace(/\r?\n/g, ' ');
    const fontSize = merged.fontSize;
    const insetX = textHorizontalPaddingMm(fontSize);
    let width = merged.width;
    if (!widthInPatch) {
      const lineMm = measureTextWidthMm(raw, fontSize, merged.charSpacing ?? 0, merged.bold ?? false, merged.fontFamily);
      const minW = Math.max(4, ptToMm(fontSize) * 1.4 + insetX * 2);
      const room = canvas ? Math.max(minW, canvas.widthMm - Math.max(0, merged.left)) : Infinity;
      width = roundMm(Math.min(room, Math.max(minW, lineMm + insetX * 2 + TEXT_FIT_SLACK_MM)));
    }
    const height = visibleTextHeightMm({
      text: raw,
      fontSize,
      widthMm: width,
      autoWrapping: 'Close',
      lineSpacing: merged.lineSpacing ?? '1.0',
      charSpacing: merged.charSpacing ?? 0,
      bold: merged.bold ?? false,
      verticalDisplay: false,
      fontFamily: merged.fontFamily,
    });
    return { ...merged, width, height, autoTextHeight: false } as LabelElement;
  }

  const fontSizeInPatch = 'fontSize' in updates && typeof updates.fontSize === 'number';

  if (fontSizeInPatch && !widthInPatch) {
    const withFont = { ...el, ...updates, width: el.width } as TextLikeElement;
    const autoHeight = withFont.autoTextHeight !== false && withFont.autoWrapping !== 'Close';
    if (autoHeight && !heightInPatch) {
      const { height: _removed, ...withoutHeight } = withFont as TextLikeElement & { height?: number };
      return withoutHeight as LabelElement;
    }
    const height = visibleTextHeightMm({
      text: textRawContent(withFont),
      fontSize: withFont.fontSize,
      widthMm: withFont.width,
      autoWrapping: withFont.autoWrapping ?? 'Word',
      lineSpacing: withFont.lineSpacing ?? '1.0',
      charSpacing: withFont.charSpacing ?? 0,
      bold: withFont.bold ?? false,
      verticalDisplay: withFont.verticalDisplay ?? false,
      fontFamily: withFont.fontFamily,
    });
    return { ...withFont, height, autoTextHeight: false } as LabelElement;
  }

  if (widthInPatch && Math.abs((updates.width as number) - el.width) > 0.02) {
    const wrapping = merged.autoWrapping ?? 'Word';
    const autoHeight = merged.autoTextHeight !== false && wrapping !== 'Close';
    const withWrap = { ...merged, autoWrapping: wrapping } as TextLikeElement;
    if (autoHeight) {
      // Keep an explicit height from a live resize commit as a floor (RN wrap can be
      // taller than Skia on very narrow boxes). Content-only edits omit height.
      if (heightInPatch) {
        return {
          ...withWrap,
          height: updates.height as number,
        } as LabelElement;
      }
      const { height: _removed, ...withoutHeight } = withWrap as TextLikeElement & { height?: number };
      return withoutHeight as LabelElement;
    }
    const reflowed = visibleTextHeightMm({
      text: textRawContent(withWrap),
      fontSize: withWrap.fontSize,
      widthMm: withWrap.width,
      autoWrapping: wrapping,
      lineSpacing: withWrap.lineSpacing ?? '1.0',
      charSpacing: withWrap.charSpacing ?? 0,
      bold: withWrap.bold ?? false,
      verticalDisplay: withWrap.verticalDisplay ?? false,
      fontFamily: withWrap.fontFamily,
    });
    return {
      ...withWrap,
      height: reflowed,
      autoTextHeight: false,
    } as LabelElement;
  }

  const shouldFitBox = Object.keys(updates).some((key) => CONTENT_FIT_KEYS.has(key));
  if (shouldFitBox && !('width' in updates) && !('height' in updates)) {
    const bounds = canvas ?? { widthMm: 200, heightMm: 200 };
    const growsWidth = Object.keys(updates).some((key) => CONTENT_GROW_KEYS.has(key));
    if (growsWidth) {
      const fitted = fitTextBoxToContent(merged, bounds);
      const autoHeight = merged.autoTextHeight !== false && merged.autoWrapping !== 'Close';
      if (autoHeight) {
        const { height: _removed, ...withoutHeight } = merged as TextLikeElement & { height?: number };
        return { ...withoutHeight, width: fitted.width } as LabelElement;
      }
      return { ...merged, width: fitted.width, height: fitted.height } as LabelElement;
    }
    const autoHeight = merged.autoTextHeight !== false && merged.autoWrapping !== 'Close';
    if (autoHeight) {
      const { height: _removed, ...withoutHeight } = merged as TextLikeElement & { height?: number };
      return withoutHeight as LabelElement;
    }
    const minH = typeof merged.height === 'number' ? merged.height : 0;
    const height = growTextFrameHeightForWidth(merged, merged.width, minH);
    return { ...merged, height, autoTextHeight: false } as LabelElement;
  }

  const autoHeight = merged.autoTextHeight !== false && merged.autoWrapping !== 'Close';
  const computedHeight = visibleTextHeightMm({
    text: textRawContent(merged),
    fontSize: merged.fontSize,
    widthMm: merged.width,
    autoWrapping: merged.autoWrapping ?? 'Word',
    lineSpacing: merged.lineSpacing ?? '1.0',
    charSpacing: merged.charSpacing ?? 0,
    bold: merged.bold ?? false,
    verticalDisplay: merged.verticalDisplay ?? false,
    fontFamily: merged.fontFamily,
  });

  if (typeof updates.height === 'number') {
    return merged as LabelElement;
  }

  if (updates.autoTextHeight === true || (autoHeight && updates.autoTextHeight !== false)) {
    const { height: _removed, ...withoutHeight } = merged as TextLikeElement & { height?: number };
    return withoutHeight as LabelElement;
  }

  if (updates.autoTextHeight === false) {
    return { ...merged, height: typeof merged.height === 'number' ? merged.height : computedHeight } as LabelElement;
  }

  if (autoHeight) {
    const { height: _removed, ...withoutHeight } = merged as TextLikeElement & { height?: number };
    return withoutHeight as LabelElement;
  }

  return merged as LabelElement;
}

const PAD_RATIO = 0.05;
const MIN_PAD_MM = 0.5;

function finiteSize(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function padMm(widthMm: number, heightMm: number) {
  // Keep a usable content inset on tiny stick labels (25×15) without eating the pad.
  const ratioPad = Math.min(widthMm, heightMm) * PAD_RATIO;
  return Math.max(MIN_PAD_MM, Math.min(ratioPad, Math.min(widthMm, heightMm) * 0.12));
}

function bboxOf(element: LabelElement) {
  const size = elementSizeMm(element);
  return {
    left: element.left,
    top: element.top,
    width: size.width,
    height: size.height,
  };
}

/** Typical body-line font (pt) for this label — not a title that fills the pad. */
export function fitFontSizePt(widthMm: number, heightMm: number, lines = 1) {
  const perLineMm = Math.max(1.6, (heightMm * 0.26) / Math.max(1, lines));
  const fromHeight = mmToPt(perLineMm / 1.25);
  const fromWidth = mmToPt(widthMm * 0.12);
  const pt = Math.min(fromHeight, fromWidth);
  // Tiny stick labels (e.g. 25×15) need smaller body type to stay inside the pad.
  const minPt = Math.min(widthMm, heightMm) < 18 ? 4 : 6;
  return Math.max(minPt, Math.min(Math.round(pt * 2) / 2, 28));
}

export function fitTextWidth(widthMm: number) {
  const pad = padMm(widthMm, widthMm);
  return Math.max(4, widthMm - pad * 2);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function existingTextFonts(existing: LabelElement[]) {
  return existing.flatMap((el) =>
    el.type === 'text' || el.type === 'time' || el.type === 'degrees' || el.type === 'arctext'
      ? [el.fontSize]
      : [],
  );
}

/** Drop a new block into free space instead of covering template content. */
function placeInLabel(
  widthMm: number,
  heightMm: number,
  boxW: number,
  boxH: number,
  existing: LabelElement[],
) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.min(boxW, Math.max(4, widthMm - pad * 2));
  const height = Math.min(boxH, Math.max(2, heightMm - pad * 2));

  if (existing.length === 0) {
    return { left: pad, top: pad, width, height };
  }

  let lowest = 0;
  for (const el of existing) {
    const box = bboxOf(el);
    lowest = Math.max(lowest, box.top + box.height);
  }

  const topBelow = lowest + pad;
  if (topBelow + height <= heightMm - pad * 0.5) {
    return { left: pad, top: topBelow, width, height };
  }

  // No vertical room — tuck into the top-left with a small offset so it stays selectable.
  const offset = Math.min(3, Math.max(1.2, Math.min(widthMm, heightMm) * 0.06));
  return {
    left: Math.min(pad + offset, Math.max(0, widthMm - width)),
    top: Math.min(pad + offset, Math.max(0, heightMm - height)),
    width,
    height,
  };
}

/** Extra box width beyond the measured words, so a fitted box keeps its text on one line. */
const TEXT_FIT_SLACK_MM = 0.6;

/** Largest share of the label a new text box may span once its font is above the default. */
const NEW_TEXT_MAX_WIDTH_SHARE = 0.7;

/** Two short lines, so a new box is compact and readable instead of one long strip. */
export const NEW_TEXT_PLACEHOLDER = 'Double-tap\nto enter text';
const NEW_TEXT_LINES = NEW_TEXT_PLACEHOLDER.split('\n');

export function fitTextDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const fonts = existingTextFonts(existing);
  const minPt = Math.min(widthMm, heightMm) < 18 ? 4 : 6;
  const fromExisting = median(fonts);
  const fontSize = fromExisting
    ? Math.max(minPt, Math.min(28, Math.round(fromExisting * 2) / 2))
    : fitFontSizePt(widthMm, heightMm, 1);
  const boxH = textBlockHeightMm(fontSize, 1);
  const boxW = Math.max(4, Math.min(fitTextWidth(widthMm), widthMm * 0.88));
  const placed = placeInLabel(widthMm, heightMm, boxW, boxH, existing);
  return { left: placed.left, top: placed.top, width: placed.width, fontSize };
}

/** A new Counter is a box just wide enough for its first value, not the whole label. */
export function fitCounterDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = [], text = '001') {
  const fontSize = DEFAULT_TEXT_FONT_PT;
  const pad = padMm(widthMm, heightMm);
  const maxW = Math.max(4, widthMm - pad * 2);
  const boxW = Math.min(maxW, Math.max(6, measureTextWidthMm(text, fontSize) + textHorizontalPaddingMm(fontSize) * 2 + 1.5));
  const boxH = textBlockHeightMm(fontSize, 1);
  const placed = placeInLabel(widthMm, heightMm, boxW, boxH, existing);
  return { left: placed.left, top: placed.top, width: placed.width, height: boxH, fontSize };
}

/**
 * New text box is one line of the placeholder, fully inside the label.
 * A font that would wrap into a frame taller than the label is reduced until
 * the box — and its resize handles — stay on the sticker.
 */
export function fitNewTextDefaults(
  widthMm: number,
  heightMm: number,
  existing: LabelElement[] = [],
  preferredFontPt = DEFAULT_TEXT_FONT_PT,
) {
  const pad = padMm(widthMm, heightMm);
  const maxW = Math.max(4, widthMm - pad * 2);
  const maxH = Math.max(2, heightMm - pad * 2);
  let fontSize = Math.max(4, Math.min(28, preferredFontPt));

  const oneLine = (pt: number) => {
    // Widest of the placeholder lines sets the box width.
    const textW = Math.max(...NEW_TEXT_LINES.map((line) => measureTextWidthMm(line, pt)));
    const padX = textHorizontalPaddingMm(pt);
    // 0.96 matches the wrap limit, so Word wrap still keeps each line whole.
    const width = textW / 0.96 + padX * 2 + 0.6;
    const height = visibleTextHeightMm({
      text: NEW_TEXT_PLACEHOLDER,
      fontSize: pt,
      widthMm: width,
      autoWrapping: 'Word',
    });
    return { width, height };
  };

  // Past the default font, keep the box to a share of the label so a big label
  // does not get a box that spans it.
  const comfortW = Math.max(4, widthMm * NEW_TEXT_MAX_WIDTH_SHARE);
  let box = oneLine(fontSize);
  while (
    fontSize > 4.01 &&
    (box.width > maxW + 0.05 ||
      box.height > maxH + 0.05 ||
      (fontSize > DEFAULT_TEXT_FONT_PT && box.width > comfortW))
  ) {
    fontSize = Math.max(4, Math.round((fontSize - 0.5) * 2) / 2);
    box = oneLine(fontSize);
  }

  const width = Math.min(maxW, Math.max(4, box.width));
  let height = box.height;
  if (box.width > maxW + 0.05) {
    height = visibleTextHeightMm({
      text: NEW_TEXT_PLACEHOLDER,
      fontSize,
      widthMm: width,
      autoWrapping: 'Word',
    });
  }
  height = Math.min(maxH, Math.max(2, height));

  const placed = placeInLabel(widthMm, heightMm, width, height, existing);
  const top = Math.min(placed.top, Math.max(0, heightMm - placed.height));
  return {
    left: placed.left,
    top,
    width: placed.width,
    height: Math.min(placed.height, Math.max(2, heightMm - top)),
    fontSize,
  };
}

export function fitBarcodeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  // Natural tight barcode proportions matching WePrint (aspect ratio ~0.40, hugging bars + HRI text)
  // Up to 60 mm wide the cap is the old 28 mm (small labels look exactly as before); on a bigger
  // label the barcode grows with it, half the label width, so it is not a speck on a 100 x 150 mm label.
  const widthCap = widthMm > 60 ? widthMm * 0.5 : 28;
  const targetW = Math.min(widthCap, Math.max(16, widthMm * 0.58));
  const width = Math.min(targetW, Math.max(6, widthMm - pad * 2));
  const targetH = Math.max(6, width * 0.40);
  const height = Math.min(targetH, Math.max(3, heightMm - pad * 2));
  const placed = placeInLabel(widthMm, heightMm, width, height, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
    fontSize: Math.max(4, Math.min(mmToPt(height * 0.25), height > 12 ? 12 : 8.5)),
  };
}

export function fitQrcodeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const size = Math.max(6, Math.min(widthMm - pad * 2, heightMm - pad * 2, widthMm * 0.4, heightMm * 0.48));
  const placed = placeInLabel(widthMm, heightMm, size, size, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
  };
}

export function fitLineDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.max(8, widthMm - pad * 2);
  const placed = placeInLabel(widthMm, heightMm, width, 0.4, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: 0.4,
  };
}

export function fitShapeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const pad = padMm(widthMm, heightMm);
  const width = Math.max(4, Math.min(widthMm - pad * 2, widthMm * 0.7));
  const height = Math.max(3, Math.min(heightMm - pad * 2, heightMm * 0.45));
  const placed = placeInLabel(widthMm, heightMm, width, height, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
  };
}

export function fitTimeDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const timeFonts = existing.flatMap((el) => (el.type === 'time' ? [el.fontSize] : []));
  const minPt = Math.min(widthMm, heightMm) < 18 ? 4 : 6;
  const fromExisting = median(timeFonts);
  const labelCap = fitFontSizePt(widthMm, heightMm, 1);
  // WePrint uses compact body-sized time (12 pt), not label-fit title sizing from fitTextDefaults.
  let fontSize = fromExisting
    ? Math.max(minPt, Math.min(28, Math.round(fromExisting * 2) / 2))
    : Math.max(minPt, Math.min(DEFAULT_TIME_STATE.fontSize, labelCap));
  const pad = padMm(widthMm, heightMm);
  const maxW = Math.max(4, widthMm - pad * 2);
  // The whole date and time must fit the label: step the type down until it does.
  const widthFor = (pt: number) => measureTextWidthMm(TIME_DISPLAY_SAMPLE, pt) + textHorizontalPaddingMm(pt) * 2 + 0.5;
  while (fontSize > 4 && widthFor(fontSize) > maxW) fontSize = Math.max(4, fontSize - 0.5);
  const measured = widthFor(fontSize);
  const boxW = Math.min(maxW, Math.max(4, measured));
  const boxH = textBlockHeightMm(fontSize, 1);
  const placed = placeInLabel(widthMm, heightMm, boxW, boxH, existing);
  return { left: placed.left, top: placed.top, width: placed.width, height: boxH, fontSize };
}

export function fitTableDefaults(
  widthMm: number,
  heightMm: number,
  rows: number,
  columns: number,
  _existing: LabelElement[] = [],
) {
  // New tables fill the whole label; the user shrinks from there.
  const placed = { left: 0, top: 0, width: widthMm, height: heightMm };
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
    rowHeights: Array.from({ length: rows }, () => placed.height / rows),
    columnWidths: Array.from({ length: columns }, () => placed.width / columns),
  };
}

export function fitClipartDefaults(widthMm: number, heightMm: number, existing: LabelElement[] = []) {
  const size = Math.max(5, Math.min(widthMm * 0.28, heightMm * 0.38));
  const placed = placeInLabel(widthMm, heightMm, size, size, existing);
  return {
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
  };
}



/** Grow or shrink one element by `factor` around its own centre (font, table cells and codes follow). */
export function scaleElementAboutCenter(el: LabelElement, factor: number, canvasWidthMm: number, canvasHeightMm: number): LabelElement {
  const before = elementSizeMm(el);
  const scaled = scaleElementFields(el, factor, factor, factor, canvasWidthMm, canvasHeightMm);
  const after = elementSizeMm(scaled);
  return {
    ...scaled,
    left: el.left + (before.width - after.width) / 2,
    top: el.top + (before.height - after.height) / 2,
  } as LabelElement;
}

/** Clamp element position/size so it stays inside the label (paddle only on rat-tail). */
export function clampElementToLabel(
  element: LabelElement,
  doc: Pick<LabelDocument, 'widthMm' | 'heightMm' | 'mediaGeometry'>,
): LabelElement {
  if (element.type === 'border') {
    const left = Math.max(0, Math.min(doc.widthMm, finiteSize(element.left, 0)));
    const top = Math.max(0, Math.min(doc.heightMm, finiteSize(element.top, 0)));
    const width = Math.max(1, Math.min(doc.widthMm - left, finiteSize(element.width, doc.widthMm)));
    const height = Math.max(1, Math.min(doc.heightMm - top, finiteSize(element.height, doc.heightMm)));
    return {
      ...element,
      left,
      top,
      width,
      height,
      rotation: 0 as const,
      lockMovement: true,
    };
  }

  const maxW = finiteSize(doc.widthMm, 50);
  const maxH = finiteSize(doc.heightMm, 30);
  const bounds = isRatTailGeometry(doc.mediaGeometry)
    ? ratTailBodyRectMm(doc.mediaGeometry)
    : { left: 0, top: 0, width: maxW, height: maxH };
  const minMm = element.type === 'line' ? 0.1 : 0.5;

  const currentSize = elementSizeMm(element);
  const rawLeft = finiteSize(element.left, 0);
  const rawTop = finiteSize(element.top, 0);
  const rawWidth = finiteSize(element.width, minMm);
  const hasExplicitHeight = 'height' in element && typeof element.height === 'number';
  const rawHeight = hasExplicitHeight
    ? finiteSize(element.height, minMm)
    : currentSize.height;

  const clamped = clampToLabelBounds(
    {
      left: rawLeft - bounds.left,
      top: rawTop - bounds.top,
      width: rawWidth,
      height: rawHeight,
    },
    { widthMm: bounds.width, heightMm: bounds.height },
    { anchor: 'body', minMm, naturalHeight: rawHeight },
  );

  const finalLeft = bounds.left + clamped.left;
  const finalTop = bounds.top + clamped.top;
  const finalWidth = clamped.width;
  const finalHeight = hasExplicitHeight ? Math.min(Math.max(minMm, rawHeight), bounds.height) : clamped.height;
  const heightMatches = !hasExplicitHeight || element.height === finalHeight;

  // Opening a label must not nudge boxes: sub-0.01 mm differences are just roundMm noise.
  const SAME_MM = 0.011;
  if (
    Math.abs(element.left - finalLeft) < SAME_MM &&
    Math.abs(element.top - finalTop) < SAME_MM &&
    Math.abs(element.width - finalWidth) < SAME_MM &&
    (heightMatches || Math.abs((element as { height: number }).height - finalHeight) < SAME_MM)
  ) {
    return element;
  }

  const patch: Record<string, unknown> = {
    left: finalLeft,
    top: finalTop,
    width: finalWidth,
  };

  if (hasExplicitHeight) {
    patch.height = finalHeight;
  }

  return { ...element, ...patch } as LabelElement;
}

export function normalizeDocumentElements(doc: LabelDocument): LabelElement[] {
  const elements = doc.mediaShape === 'circle'
    ? doc.elements.filter((el) => {
        if (el.type === 'shape' && (el.figureShape === 'circle' || el.figureShape === 'oval')) {
          const minDim = Math.min(doc.widthMm, doc.heightMm);
          const isFullCanvas = el.width >= minDim - 1.5 && el.height >= minDim - 1.5;
          if (isFullCanvas && el.fill && (el.fillColor === '#FFFFFF' || el.fillColor === '#ffffff')) {
            return false;
          }
        }
        return true;
      })
    : doc.elements;
  return elements.map((el) => {
    const clamped = clampElementToLabel(el, doc);
    if (clamped.type === 'table') return ensureTableCells(clamped);
    return clamped;
  });
}

/**
 * Scale one element's dimensional fields for a label resize.
 * `sx`/`sy` scale position/size (anisotropic — matches the new aspect ratio).
 * `fontScale` (uniform, normally min(sx, sy)) scales ink-thickness fields —
 * font size, stroke/line width, corner radius — so glyphs and strokes don't
 * distort when width and height scale by different amounts.
 */
/**
 * Scale one element's dimensional fields for a label resize.
 * `sx`/`sy` scale position/size (anisotropic — matches the new aspect ratio).
 * `fontScale` (uniform, min(sx, sy)) scales ink-thickness fields —
 * font size, stroke/line width, corner radius.
 * Text height is reflowed via computeTextElementHeightMm.
 * QR codes are constrained to 1:1 square ratio.
 * Barcodes enforce an optical scan aspect proportion guard (<= 6:1) with a 3.5mm floor.
 */
export function scaleElementFields(
  el: LabelElement,
  sx: number,
  sy: number,
  fontScale: number,
  canvasWidthMm: number,
  canvasHeightMm: number,
): LabelElement {
  const scaledLeft = el.left * sx;
  const scaledTop = el.top * sy;
  const scaledWidth = el.width * sx;

  if (el.type === 'text' || el.type === 'degrees') {
    const originalFs = 'fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 12;
    const scaledFs = Math.max(4, originalFs * fontScale);
    const rawText =
      el.contentType === 'Data Source' && el.columnNameContent
        ? `{${el.columnNameContent}}`
        : 'text' in el
          ? el.text
          : el.content;

    const reflowedHeight = visibleTextHeightMm({
      text: rawText,
      fontSize: scaledFs,
      widthMm: Math.max(2, scaledWidth),
      autoWrapping: el.autoWrapping ?? 'Word',
      lineSpacing: el.lineSpacing ?? '1.0',
      charSpacing: el.charSpacing ?? 0,
      bold: el.bold ?? false,
      verticalDisplay: el.verticalDisplay ?? false,
      fontFamily: el.fontFamily,
    });

    return {
      ...el,
      left: scaledLeft,
      top: scaledTop,
      width: Math.max(2, scaledWidth),
      height: reflowedHeight,
      fontSize: scaledFs,
    };
  }

  if (el.type === 'time') {
    const originalFs = 'fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 12;
    const scaledFs = Math.max(4, originalFs * fontScale);
    const reflowedHeight = textBlockHeightMm(scaledFs, 1);
    return {
      ...el,
      left: scaledLeft,
      top: scaledTop,
      width: Math.max(2, scaledWidth),
      height: reflowedHeight,
      fontSize: scaledFs,
    };
  }

  if (el.type === 'qrcode') {
    const rawW = el.width * sx;
    const rawH = (typeof el.height === 'number' ? el.height : el.width) * sy;
    // QR codes must strictly preserve 1:1 square ratio
    const squareSize = Math.max(2, Math.min(rawW, rawH));
    return {
      ...el,
      left: scaledLeft,
      top: scaledTop,
      width: squareSize,
      height: squareSize,
    };
  }

  if (el.type === 'barcode') {
    const rawH = (typeof el.height === 'number' ? el.height : 10) * sy;
    // Enforce 6:1 aspect ratio ceiling (height >= width / 6) if headroom permits, with 3.5mm absolute floor
    const minScanH = 3.5;
    const idealHeight = Math.max(rawH, scaledWidth / 6);
    const availableH = Math.max(minScanH, canvasHeightMm - scaledTop);
    const targetHeight = Math.max(minScanH, Math.min(idealHeight, availableH));

    const originalFs = 'fontSize' in el && typeof el.fontSize === 'number' ? el.fontSize : 10;
    const scaledFs = Math.max(4, originalFs * fontScale);
    return {
      ...el,
      left: scaledLeft,
      top: scaledTop,
      width: Math.max(4, scaledWidth),
      height: targetHeight,
      fontSize: scaledFs,
    };
  }

  if (el.type === 'clipart' || el.type === 'image') {
    // Preserve aspect ratio for graphical assets using uniform fontScale
    const scaledW = el.width * fontScale;
    const scaledH = (typeof el.height === 'number' ? el.height : el.width) * fontScale;
    return {
      ...el,
      left: scaledLeft,
      top: scaledTop,
      width: Math.max(2, scaledW),
      height: Math.max(2, scaledH),
    };
  }

  if (el.type === 'line') {
    const vertical = (el.height ?? 0) >= el.width * 2;
    const lineW = vertical ? el.width * fontScale : el.width * sx;
    const lineH = vertical ? (el.height ?? 0.4) * sy : (el.height ?? 0.4) * fontScale;
    return {
      ...el,
      left: scaledLeft,
      top: scaledTop,
      width: Math.max(0.1, lineW),
      height: Math.max(0.1, lineH),
    };
  }

  if (el.type === 'table') {
    return {
      ...el,
      left: scaledLeft,
      top: scaledTop,
      width: Math.max(4, scaledWidth),
      height: Math.max(4, (el.height ?? 10) * sy),
      columnWidths: el.columnWidths.map((n) => n * sx),
      rowHeights: el.rowHeights.map((n) => n * sy),
    };
  }

  const scaled: LabelElement = {
    ...el,
    left: scaledLeft,
    top: scaledTop,
    width: Math.max(0.5, scaledWidth),
  };
  if ('height' in scaled && typeof scaled.height === 'number') {
    (scaled as { height: number }).height = Math.max(0.5, (scaled as { height: number }).height * sy);
  }
  if ('fontSize' in scaled && typeof scaled.fontSize === 'number') {
    (scaled as { fontSize: number }).fontSize = Math.max(4, scaled.fontSize * fontScale);
  }
  if ('lineWidth' in scaled && typeof scaled.lineWidth === 'number') {
    (scaled as { lineWidth: number }).lineWidth = Math.max(0.1, scaled.lineWidth * fontScale);
  }
  if ('roundRadius' in scaled && typeof scaled.roundRadius === 'number') {
    (scaled as { roundRadius: number }).roundRadius *= fontScale;
  }
  return scaled;
}

/**
 * Border is locked to the label bounds, not scaled by sx/sy like other
 * elements — but its stroke thickness (`lineWidth`) is still an ink-thickness
 * field and must scale by `fontScale`.
 */
function scaleBorderElement(
  el: LabelElement & { type: 'border' },
  _left: number,
  _top: number,
  width: number,
  height: number,
  fontScale: number,
): LabelElement {
  const pinned = insetBorderBox(0, 0, width, height, width, height);
  return {
    ...el,
    ...pinned,
    geometryVersion: 1,
    rotation: 0 as const,
    lockMovement: true,
    lineWidth: Math.max(0.1, el.lineWidth * fontScale),
  };
}

/**
 * Scale and reposition layers for a new stock size (clone/2ups creation, and
 * the editor “Scale proportionally” size-change path). Internals are the
 * source of truth for text reflow, QR square-lock, barcode floors, and
 * full-bleed border pinning — do not wrap with a second position pass.
 */

export function scaleDocumentToSize(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const sx = widthMm / Math.max(doc.widthMm, 0.01);
  const sy = heightMm / Math.max(doc.heightMm, 0.01);
  const fontScale = Math.min(sx, sy);
  const nextDoc: LabelDocument = {
    ...doc,
    widthMm,
    heightMm,
    mediaGeometry: scaleMediaGeometry(doc.mediaGeometry, sx, sy),
  };

  const scaleElements = (source: LabelElement[]): LabelElement[] =>
    source.map((el) => {
      if (el.type === 'border') {
        return clampElementToLabel(
          scaleBorderElement(el, 0, 0, widthMm, heightMm, fontScale),
          nextDoc,
        );
      }
      return clampElementToLabel(
        scaleElementFields(el, sx, sy, fontScale, widthMm, heightMm),
        nextDoc,
      );
    });

  const elements = scaleElements(doc.elements);
  if (!doc.ups) {
    return { ...nextDoc, elements };
  }

  const panels = doc.ups.panels.map((panel, i) =>
    i === doc.ups!.activeIndex ? elements : scaleElements(panel),
  );
  return {
    ...nextDoc,
    elements,
    ups: { ...doc.ups, panels },
  };
}

/**
 * Keep every element's width/height (and all other fields) unchanged.
 * Only `left` / `top` move with the relative-origin formula:
 *   new_left = (old_left / old_label_width) × new_label_width
 * Does not clamp and does not re-pin borders.
 */
export function repositionDocumentToSize(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const sx = widthMm / Math.max(doc.widthMm, 0.01);
  const sy = heightMm / Math.max(doc.heightMm, 0.01);
  const moveElements = (source: LabelElement[]): LabelElement[] =>
    source.map((el) => ({
      ...el,
      left: el.left * sx,
      top: el.top * sy,
    }));

  const elements = moveElements(doc.elements);
  const nextDoc: LabelDocument = { ...doc, widthMm, heightMm, elements };
  if (!doc.ups) return nextDoc;

  const panels = doc.ups.panels.map((panel, i) =>
    i === doc.ups!.activeIndex ? elements : moveElements(panel),
  );
  return {
    ...nextDoc,
    ups: { ...doc.ups, panels },
  };
}

/**
 * Uniform contain-fit onto a print page, centered L/R and T/B.
 * Small templates keep their aspect and sit in the middle of larger stock
 * (matches “print looks like the preview, centered on the label”).
 */
export function fitDocumentCenteredOnPage(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const scale = Math.min(
    widthMm / Math.max(doc.widthMm, 0.01),
    heightMm / Math.max(doc.heightMm, 0.01),
  );
  const contentW = doc.widthMm * scale;
  const contentH = doc.heightMm * scale;
  const ox = (widthMm - contentW) / 2;
  const oy = (heightMm - contentH) / 2;
  const nextDoc = { ...doc, widthMm, heightMm };
  const elements = doc.elements.map((el) => {
    const scaled = scaleElementFields(el, scale, scale, scale, contentW, contentH);
    scaled.left = ox + scaled.left;
    scaled.top = oy + scaled.top;
    return clampElementToLabel(scaled, nextDoc);
  });
  const upsTile = doc.upsTile
    ? {
        ...doc.upsTile,
        cellWidthMm: doc.upsTile.cellWidthMm * scale,
        cellHeightMm: doc.upsTile.cellHeightMm * scale,
        gapMm: doc.upsTile.gapMm * scale,
        originXMm: ox + doc.upsTile.originXMm * scale,
        originYMm: oy + doc.upsTile.originYMm * scale,
      }
    : undefined;
  return { ...nextDoc, elements, upsTile };
}

/**
 * Stretch design to fill the full print page (edge-to-edge).
 * Used when the user picks a target size like 4×6 so the print is not a
 * small stamp in the middle of the label.
 */
export function fitDocumentToFillPage(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const scaleX = widthMm / Math.max(doc.widthMm, 0.01);
  const scaleY = heightMm / Math.max(doc.heightMm, 0.01);
  const fontScale = Math.min(scaleX, scaleY);
  const nextDoc = { ...doc, widthMm, heightMm };
  const elements = doc.elements.map((el) => {
    if (el.type === 'border') {
      return clampElementToLabel(
        scaleBorderElement(el, 0, 0, widthMm, heightMm, fontScale),
        nextDoc,
      );
    }
    return clampElementToLabel(
      scaleElementFields(el, scaleX, scaleY, fontScale, widthMm, heightMm),
      nextDoc,
    );
  });
  return { ...nextDoc, elements };
}

/** Template title/body font sizes derived from label mm (not raw mm as pt). */
export function templateFontSizes(widthMm: number, heightMm: number) {
  const isLargeLabel = widthMm >= 75 && heightMm >= 95;
  const baseTitle = isLargeLabel ? 18 : fitFontSizePt(widthMm, heightMm, 1) * 1.15;
  const titlePt = Math.min(28, Math.max(baseTitle, 8));
  const bodyPt = isLargeLabel
    ? 12
    : Math.max(6, Math.min(titlePt * 0.7, fitFontSizePt(widthMm, heightMm, 2)));
  const smallPt = isLargeLabel ? 9 : Math.max(6, bodyPt * 0.85);
  return { titlePt, bodyPt, smallPt };
}
