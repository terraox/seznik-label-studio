import type { LabelDocument, LabelElement, LabelOrientation } from '@/lib/label-document';
import {
  calcPrintCanvas,
  resampleGrayToSize,
  type FitMode,
  type PrintLabelResult,
} from '@/lib/img-to-label-engine';
import {
  binarizeGrayForPrint,
  cropGrayRect,
  grayToBits,
  rotateGray,
  type BitRaster,
  type GrayRaster,
} from '@/lib/printer/escpos';
import { td404PackedPageDots } from '@/printing/raster/td404-mono-validate';

function printableElements(doc: LabelDocument): LabelElement[] {
  return doc.elements.filter((el) => el.needPrinting !== false);
}

export function isFitLabelImageOnlyDocument(doc: LabelDocument): boolean {
  const printable = printableElements(doc);
  if (printable.length !== 1) return false;
  const el = printable[0];
  if (el.type !== 'image') return false;
  if (!el.fitLabelSource) return false;
  return Boolean((el.printUri || el.uri || '').trim());
}

export function fitLabelPrintSourceUri(el: Extract<LabelElement, { type: 'image' }>): string {
  return (el.printUri || el.uri || '').trim();
}

export function fitLabelPrintImageElement(doc: LabelDocument): Extract<LabelElement, { type: 'image' }> | null {
  const el = printableElements(doc).find((item) => item.type === 'image');
  return el && el.type === 'image' ? el : null;
}

function fitModeFromElement(el: Extract<LabelElement, { type: 'image' }> | null): FitMode {
  if (!el) return 'contain';
  if (el.contentFit === 'cover') return 'cover';
  if (el.contentFit === 'fill') return 'stretch';
  return 'contain';
}

function orientedMm(
  widthMm: number,
  heightMm: number,
  orientationDeg: LabelOrientation,
): { widthMm: number; heightMm: number } {
  if (orientationDeg === 90 || orientationDeg === 270) {
    return { widthMm: heightMm, heightMm: widthMm };
  }
  return { widthMm, heightMm };
}

function blitGray(src: GrayRaster, destW: number, destH: number, ox: number, oy: number): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  const out = new Uint8Array(width * height);
  out.fill(255);
  const destX = Math.max(0, ox);
  const destY = Math.max(0, oy);
  const srcX = Math.max(0, -ox);
  const srcY = Math.max(0, -oy);
  const rowW = Math.min(src.width - srcX, width - destX);
  const rowH = Math.min(src.height - srcY, height - destY);
  if (rowW <= 0 || rowH <= 0) return { width, height, gray: out };
  for (let y = 0; y < rowH; y++) {
    const srcRow = (srcY + y) * src.width + srcX;
    out.set(src.gray.subarray(srcRow, srcRow + rowW), (destY + y) * width + destX);
  }
  return { width, height, gray: out };
}

/**
 * Fit the cropped extract onto the selected stock in printer dots.
 * Shrink with box-average (keeps barcode bars). Grow with nearest-neighbor
 * (keeps QR modules crisp). Never bilinear — that smears modules.
 */
export function fitGrayToPrintCanvas(
  src: GrayRaster,
  destW: number,
  destH: number,
  fitMode: FitMode,
): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  if (src.width === width && src.height === height) return src;

  if (fitMode === 'stretch') {
    return resampleGrayToSize(src, width, height);
  }

  const scale =
    fitMode === 'cover'
      ? Math.max(width / Math.max(src.width, 1), height / Math.max(src.height, 1))
      : Math.min(width / Math.max(src.width, 1), height / Math.max(src.height, 1));
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const scaled = resampleGrayToSize(src, dw, dh);
  if (fitMode === 'cover') {
    const cropX = Math.floor((scaled.width - width) / 2);
    const cropY = Math.floor((scaled.height - height) / 2);
    return blitGray(scaled, width, height, -cropX, -cropY);
  }
  return blitGray(
    scaled,
    width,
    height,
    Math.floor((width - scaled.width) / 2),
    Math.floor((height - scaled.height) / 2),
  );
}

/** Native-resize cap before JS PNG decode: 2× the unrotated SIZE long edge. */
export function fitLabelDecodeMaxEdgePx(widthMm: number, heightMm: number, dpi: number): number {
  const canvas = calcPrintCanvas(widthMm, heightMm, dpi);
  return Math.max(1, Math.max(canvas.widthPx, canvas.heightPx) * 2);
}

export function rasterFitLabelGray(
  sourceGray: GrayRaster,
  doc: LabelDocument,
  dpi: number,
  stock?: { widthMm: number; heightMm: number },
): PrintLabelResult {
  const widthMm = stock?.widthMm ?? doc.widthMm;
  const heightMm = stock?.heightMm ?? doc.heightMm;
  const canvas = calcPrintCanvas(widthMm, heightMm, dpi);
  const el = fitLabelPrintImageElement(doc);
  const fitMode = fitModeFromElement(el);
  const gray = fitGrayToPrintCanvas(sourceGray, canvas.widthPx, canvas.heightPx, fitMode);
  return {
    widthMm,
    heightMm,
    widthPx: canvas.widthPx,
    heightPx: canvas.heightPx,
    dpi,
    gray,
    fitMode,
    geometry: canvas.geometry,
  };
}

export type FitLabelPrintPayload = {
  /** SIZE-dot 0/255 gray after orientation — PNG printers, no extra ink pass. */
  gray: GrayRaster;
  bits: BitRaster;
  /** TSPL BITMAP width in printer dots (bytes×8, packed down). */
  widthDots: number;
  /** TSPL BITMAP height in printer dots. */
  heightDots: number;
  bytesPerRow: number;
  sizeDotsW: number;
  sizeDotsH: number;
  widthMm: number;
  heightMm: number;
};

/**
 * ViewShot-equivalent Fit Label job: raster the unrotated canvas, rotate, then
 * pack TSPL width down. One threshold, no contrast stretch, no bilinear grow.
 */
export function buildFitLabelPrintPayload(
  sourceGray: GrayRaster,
  doc: LabelDocument,
  options: {
    dpi: number;
    threshold: number;
    orientationDeg: LabelOrientation;
  },
): FitLabelPrintPayload {
  const rendered = rasterFitLabelGray(sourceGray, doc, options.dpi, {
    widthMm: doc.widthMm,
    heightMm: doc.heightMm,
  });
  const gray = options.orientationDeg
    ? rotateGray(rendered.gray, options.orientationDeg)
    : rendered.gray;
  const paper = orientedMm(doc.widthMm, doc.heightMm, options.orientationDeg);
  const binary = binarizeGrayForPrint(gray, {
    threshold: options.threshold,
    dither: false,
    stretchContrast: false,
  });
  const packedPage = td404PackedPageDots(paper.widthMm, paper.heightMm, options.dpi);
  // Pack DOWN from the top-left so leftover 0–7 SIZE columns are cropped on the
  // right — same contract as TSPL BITMAP (width is bytes×8, x/y/height in dots).
  const packed = cropGrayRect(binary, 0, 0, packedPage.packedW, packedPage.packedH);
  const bits = grayToBits(packed, { threshold: 128, dither: false });
  if (bits.bytesPerRow * 8 !== packedPage.packedW || packed.width !== packedPage.packedW) {
    throw new Error(
      `Fit Label BITMAP dots mismatch: packed ${packed.width}x${packed.height} bytesPerRow=${bits.bytesPerRow} expected ${packedPage.packedW}x${packedPage.packedH}`,
    );
  }
  return {
    gray: binary,
    bits,
    widthDots: packedPage.packedW,
    heightDots: packedPage.packedH,
    bytesPerRow: bits.bytesPerRow,
    sizeDotsW: packedPage.sizeDotsW,
    sizeDotsH: packedPage.sizeDotsH,
    widthMm: paper.widthMm,
    heightMm: paper.heightMm,
  };
}
