/**
 * How the app draws sample elements, for the sample designer: the app's own barcode encoder and
 * bar snapping, real QR modules, and the app's text box metrics. Browser only (text is measured on a canvas).
 */
import QRCode from 'qrcode';

import { barcodeModulesForMode } from '../../../src/lib/barcode-code128';
import { snap1DBarcodeModules, type SnappedBar } from '../../../src/lib/barcode/barcode-snapping';

export const PT_MM = 25.4 / 72;
/** DESIGN_INK in the app's element renderer (drawingColorIndex 0). */
export const INK = '#111111';
/** DRAWING_COLORS[1]: sample text and barcodes are created with drawingColorIndex 1. */
export const INK_BLACK = '#000000';
/** The app's 'Default' face is the system sans (Roboto on Android). */
export const APP_FONT = 'Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';

/** Same padding and line box as the app's text frame (text-metrics.ts). */
export const textPadXMm = (pt: number) => Math.max(0.55, pt * PT_MM * 0.26);
export const textPadYMm = (pt: number) => Math.max(0.32, pt * PT_MM * 0.1);
export const textLineMm = (pt: number) => pt * PT_MM * 1.25;

let ctx: CanvasRenderingContext2D | null = null;
function textWidthMm(text: string, pt: number, bold: boolean): number {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * pt * PT_MM * 0.55;
  // Measured at 100 px per mm for precision, then scaled back.
  ctx.font = `${bold ? 600 : 400} ${pt * PT_MM * 100}px ${APP_FONT}`;
  return ctx.measureText(text).width / 100;
}

/** Word wrap inside the box, as the app does ('Word' mode): long words break by character. */
export function wrapText(text: string, boxWidthMm: number, pt: number, bold: boolean): string[] {
  const inner = Math.max(0.1, boxWidthMm - textPadXMm(pt) * 2);
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (!line || textWidthMm(next, pt, bold) <= inner) {
        line = next;
        continue;
      }
      lines.push(line);
      line = word;
    }
    // A single word wider than the box breaks by character.
    while (line && textWidthMm(line, pt, bold) > inner && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && textWidthMm(line.slice(0, cut), pt, bold) > inner) cut -= 1;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
    lines.push(line);
  }
  return lines;
}

/** Text box height for its wrapped lines, padding included. */
export function textHeightMm(text: string, boxWidthMm: number, pt: number, bold: boolean): number {
  const lines = wrapText(text, boxWidthMm, pt, bold).length;
  return Math.round((Math.max(1, lines) * textLineMm(pt) + textPadYMm(pt) * 2) * 100) / 100;
}

/** Digit size the app gives a sample barcode of this height (template-sample-elements.ts). */
export const barcodeFontPt = (heightMm: number) => Math.min(10, Math.max(4.5, Math.round(heightMm * 0.55 * 2) / 2));

/** CODE-128 bars snapped to 203 dpi dots, no quiet zone, as the editor shows them. Null = cannot encode. */
export function barcodeBars(text: string, widthMm: number): SnappedBar[] | null {
  const modules = barcodeModulesForMode('CODE-128', text);
  if (!modules) return null;
  return snap1DBarcodeModules(modules, widthMm, 203, false)?.bars ?? null;
}

/** QR modules at error level L (the app's default), or null when the text does not fit. */
export function qrModules(text: string): { size: number; data: Uint8Array } | null {
  if (!text) return null;
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'L' });
    return { size: qr.modules.size, data: new Uint8Array(qr.modules.data) };
  } catch {
    return null;
  }
}
