import { DEFAULT_ELEMENT_STATE, DEFAULT_TEXT_FONT_PT } from '@/components/editor/types';
import { createLabelDocument, generateId, type LabelDocument, type LabelElement } from '@/lib/label-document';

export const DIAGNOSTIC_COMPACT_LABEL_WIDTH_MM = 50;
export const DIAGNOSTIC_COMPACT_LABEL_HEIGHT_MM = 15;

/** Headless doc for test strips — same raster path as Print. */
export function buildDiagnosticCompactLabelDocument(
  lines: readonly string[],
  widthMm = DIAGNOSTIC_COMPACT_LABEL_WIDTH_MM,
  heightMm = DIAGNOSTIC_COMPACT_LABEL_HEIGHT_MM,
  layout: {
    marginMm?: number;
    marginTopMm?: number;
    /** Right inset; default matches left so older callers stay symmetric. */
    marginRightMm?: number;
    lineHeightMm?: number;
    fontPt?: number;
    maxLines?: number;
    bold?: boolean;
  } = {},
): LabelDocument {
  const marginLeftMm = layout.marginMm ?? 1;
  const marginTopMm = layout.marginTopMm ?? layout.marginMm ?? 1;
  const marginRightMm = layout.marginRightMm ?? marginLeftMm;
  const lineHeightMm = layout.lineHeightMm ?? (heightMm <= 16 ? 4.2 : 5.5);
  const textWidthMm = Math.max(8, widthMm - marginLeftMm - marginRightMm);
  const fontPt = layout.fontPt ?? DEFAULT_TEXT_FONT_PT;
  const elements: LabelElement[] = lines
    .map((line) => String(line).trim())
    .filter((line) => line.length > 0)
    .slice(0, layout.maxLines ?? 4)
    .map((text, index) => ({
      id: generateId('diag'),
      type: 'text' as const,
      ...DEFAULT_ELEMENT_STATE,
      text,
      left: marginLeftMm,
      top: marginTopMm + index * lineHeightMm,
      width: textWidthMm,
      height: lineHeightMm,
      fontSize: fontPt,
      bold: layout.bold ?? false,
      align: 'left' as const,
      autoWrapping: 'Close' as const,
      autoTextHeight: false,
      fontFamily: 'Default',
      needPrinting: true,
    }));
  return createLabelDocument({
    name: 'Diagnostic test label',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}
