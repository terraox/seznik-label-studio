import { scanFromURLAsync, type BarcodeType } from 'expo-camera';

import { applyImageCrop } from '@/lib/editor/apply-image-crop';
import { FULL_CROP, type NormalizedCrop } from '@/lib/editor/image-crop-math';
import {
  fitLabelPdfCropTarget,
  isFullSourceCrop,
} from '@/lib/img-to-label-document';
import { isOcrError, recognizeImage } from '@/lib/ocr';
import { payloadFromBarcodeResult, SCAN_CODE_TYPES } from '@/lib/scan-codes';
import { loadPdfMetadata } from '@/lib/pdf-editor/load';
import { EXPORT_DPI, rasterPdfPageCached } from '@/lib/pdf-editor/raster';

export {
  fitLabelPdfCropTarget,
  fitLabelRasterDpi,
  isFullSourceCrop,
} from '@/lib/img-to-label-document';

const QR_TYPES: BarcodeType[] = ['qr', 'aztec', 'datamatrix', 'pdf417'];

export type ImgToLabelCodeHit = {
  kind: 'barcode' | 'qr';
  type: string;
  data: string;
};

export type ImgToLabelDetection = {
  codes: ImgToLabelCodeHit[];
  text: string;
  hasBarcode: boolean;
  hasQr: boolean;
  hasText: boolean;
  preferSharp: boolean;
};

export function emptyImgToLabelDetection(): ImgToLabelDetection {
  return {
    codes: [],
    text: '',
    hasBarcode: false,
    hasQr: false,
    hasText: false,
    preferSharp: false,
  };
}

export async function detectImgToLabelContent(uri: string): Promise<ImgToLabelDetection> {
  const codes: ImgToLabelCodeHit[] = [];
  try {
    const results = await scanFromURLAsync(uri, SCAN_CODE_TYPES);
    for (const result of results) {
      const payload = payloadFromBarcodeResult(result);
      if (!payload) continue;
      const isQr = QR_TYPES.includes(result.type as BarcodeType);
      codes.push({
        kind: isQr ? 'qr' : 'barcode',
        type: payload.type,
        data: payload.data,
      });
    }
  } catch {
    // Still try OCR if barcode scanning is empty or unavailable.
  }

  let text = '';
  try {
    const recognized = await recognizeImage(uri);
    text = recognized.text.trim();
  } catch (error) {
    if (!isOcrError(error) || error.code !== 'no_text') {
      // Recognition failed; keep barcode hits if we have them.
    }
  }

  const hasBarcode = codes.some((code) => code.kind === 'barcode');
  const hasQr = codes.some((code) => code.kind === 'qr');
  const hasText = text.length > 0;
  return {
    codes,
    text,
    hasBarcode,
    hasQr,
    hasText,
    preferSharp: hasBarcode || hasQr || hasText,
  };
}

export function describeImgToLabelDetection(detection: ImgToLabelDetection): string {
  const parts: string[] = [];
  const qrs = detection.codes.filter((code) => code.kind === 'qr').length;
  const barcodes = detection.codes.filter((code) => code.kind === 'barcode').length;
  if (qrs) parts.push(qrs === 1 ? '1 QR' : `${qrs} QR codes`);
  if (barcodes) parts.push(barcodes === 1 ? '1 barcode' : `${barcodes} barcodes`);
  if (detection.hasText) parts.push('text');
  if (parts.length === 0) return 'No QR, barcode, or text found. Image will be placed as-is.';
  return `Detected ${parts.join(', ')}. Contain-fit keeps codes scannable on the canvas.`;
}

export async function rasterPdfLabelPage(
  uri: string,
  pageIndex: number,
  dpi = EXPORT_DPI,
): Promise<{ uri: string; width: number; height: number; pageCount: number }> {
  const page = await rasterPdfPageCached(uri, pageIndex, dpi);
  return {
    uri: page.uri,
    width: page.widthPx,
    height: page.heightPx,
    pageCount: page.pageCount,
  };
}

export async function loadPdfLabelSource(uri: string, dpi = EXPORT_DPI): Promise<{
  pageCount: number;
  firstPage: { uri: string; width: number; height: number };
}> {
  const meta = await loadPdfMetadata(uri);
  const firstPage = await rasterPdfLabelPage(uri, 0, dpi);
  return {
    pageCount: Math.max(meta.pageCount, firstPage.pageCount),
    firstPage: {
      uri: firstPage.uri,
      width: firstPage.width,
      height: firstPage.height,
    },
  };
}

/**
 * Raster one PDF page at output DPI and crop in source pixels to a PNG.
 * Preview scale is ignored — crop is 0–1 of the original page bitmap.
 */
export async function cropPdfPageToPngUri(
  uri: string,
  pageIndex: number,
  crop: NormalizedCrop,
  dpi: number,
): Promise<{
  uri: string;
  width: number;
  height: number;
  pageCount: number;
  sourceWidth: number;
  sourceHeight: number;
}> {
  const target = fitLabelPdfCropTarget(uri, pageIndex, dpi);
  const page = await rasterPdfLabelPage(target.uri, target.pageIndex, target.dpi);
  const next = isFullSourceCrop(crop) ? FULL_CROP : crop;
  if (isFullSourceCrop(next)) {
    return {
      uri: page.uri,
      width: page.width,
      height: page.height,
      pageCount: page.pageCount,
      sourceWidth: page.width,
      sourceHeight: page.height,
    };
  }
  const cropped = await applyImageCrop(page.uri, page.width, page.height, next, { format: 'png' });
  return {
    uri: cropped.uri,
    width: cropped.width,
    height: cropped.height,
    pageCount: page.pageCount,
    sourceWidth: page.width,
    sourceHeight: page.height,
  };
}
