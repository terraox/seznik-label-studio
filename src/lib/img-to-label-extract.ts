import { cropNormToPixels, FULL_CROP, type NormalizedCrop } from '@/lib/editor/image-crop-math';
import {
  expandLabelCropNorm,
  findLabelCropNorm,
  resampleGrayToSize,
} from '@/lib/img-to-label-engine';
import { isFullSourceCrop } from '@/lib/img-to-label-document';
import type { GrayRaster } from '@/lib/printer/escpos';

export const FIT_LABEL_ANALYSIS_MAX_EDGE_PX = 800;
const ANALYSIS_MAX_EDGE_PX = FIT_LABEL_ANALYSIS_MAX_EDGE_PX;
const MIN_CERTAIN_AREA = 0.15;

export type FitLabelExtractCheck = {
  ok: boolean;
  reason?: 'empty' | 'size' | 'aspect' | 'orientation';
};

export type FitLabelDetectedCrop = {
  crop: NormalizedCrop;
  certain: boolean;
  width?: number;
  height?: number;
};

export class FitLabelExtractError extends Error {
  readonly reason: NonNullable<FitLabelExtractCheck['reason']>;
  constructor(reason: NonNullable<FitLabelExtractCheck['reason']>, message?: string) {
    super(message ?? `Fit Label extract failed (${reason}).`);
    this.name = 'FitLabelExtractError';
    this.reason = reason;
  }
}

export function isFitLabelCropCertain(crop: NormalizedCrop | null | undefined): boolean {
  if (!crop) return false;
  const area = crop.w * crop.h;
  if (area < MIN_CERTAIN_AREA) return false;
  if (crop.w < 0.06 || crop.h < 0.06) return false;
  return true;
}

export function analysisGrayForFitLabel(src: GrayRaster): GrayRaster {
  const longEdge = Math.max(src.width, src.height);
  if (longEdge <= ANALYSIS_MAX_EDGE_PX) return src;
  const scale = ANALYSIS_MAX_EDGE_PX / longEdge;
  return resampleGrayToSize(
    src,
    Math.max(1, Math.round(src.width * scale)),
    Math.max(1, Math.round(src.height * scale)),
  );
}

/** Ink bounds in the photo/page, padded for barcode quiet zone. Geometry only — no OCR rebuild. */
export function detectFitLabelCrop(gray: GrayRaster): FitLabelDetectedCrop {
  const found = findLabelCropNorm(analysisGrayForFitLabel(gray));
  if (!found) return { crop: FULL_CROP, certain: false };
  const crop = expandLabelCropNorm(found, 0.08);
  return { crop, certain: isFitLabelCropCertain(crop) };
}

export function verifyFitLabelExtract(params: {
  sourceWidth: number;
  sourceHeight: number;
  crop: NormalizedCrop;
  extractWidth: number;
  extractHeight: number;
}): FitLabelExtractCheck {
  const box = cropNormToPixels(params.crop, params.sourceWidth, params.sourceHeight);
  if (box.width < 8 || box.height < 8 || params.extractWidth < 8 || params.extractHeight < 8) {
    return { ok: false, reason: 'empty' };
  }
  if (
    Math.abs(params.extractWidth - box.width) > 1 ||
    Math.abs(params.extractHeight - box.height) > 1
  ) {
    return { ok: false, reason: 'size' };
  }
  const cropAspect = box.width / box.height;
  const extractAspect = params.extractWidth / params.extractHeight;
  if (!(cropAspect > 0) || !(extractAspect > 0) || Math.abs(Math.log(cropAspect / extractAspect)) > 0.02) {
    return { ok: false, reason: 'aspect' };
  }
  const cropLandscape = box.width > box.height * 1.08;
  const cropPortrait = box.height > box.width * 1.08;
  const extractLandscape = params.extractWidth > params.extractHeight * 1.08;
  const extractPortrait = params.extractHeight > params.extractWidth * 1.08;
  if ((cropLandscape && extractPortrait) || (cropPortrait && extractLandscape)) {
    return { ok: false, reason: 'orientation' };
  }
  return { ok: true };
}

export function assertFitLabelExtract(params: {
  sourceWidth: number;
  sourceHeight: number;
  crop: NormalizedCrop;
  extractWidth: number;
  extractHeight: number;
}): void {
  const check = verifyFitLabelExtract(params);
  if (!check.ok) {
    throw new FitLabelExtractError(check.reason ?? 'size');
  }
}

export function fitLabelPrintCanCopyBytes(uri: string, crop: NormalizedCrop | null | undefined): boolean {
  return isFullSourceCrop(crop) && /\.png(?:\?|#|$)/i.test(uri);
}
