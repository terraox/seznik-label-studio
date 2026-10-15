import * as FileSystem from 'expo-file-system/legacy';

import { applyImageCrop } from '@/lib/editor/apply-image-crop';
import { downscaleImageUriToMaxEdge, ingestFitLabelImage } from '@/lib/editor/image-ingest-native';
import { FULL_CROP, type NormalizedCrop } from '@/lib/editor/image-crop-math';
import { getImagePixelSize } from '@/lib/file-import/resolve-image-size';
import { cropPdfPageToPngUri } from '@/lib/img-to-label-content';
import {
  assertFitLabelExtract,
  detectFitLabelCrop,
  FIT_LABEL_ANALYSIS_MAX_EDGE_PX,
  fitLabelPrintCanCopyBytes,
  type FitLabelDetectedCrop,
} from '@/lib/img-to-label-extract';
import { decodeGalleryImage } from '@/lib/printer/gallery-decode';
import {
  buildFitLabelDocument,
  isFullSourceCrop,
} from '@/lib/img-to-label-document';
import type { FitMode } from '@/lib/img-to-label-engine';
import type { LabelDocument, LabelOrientation, PaperType } from '@/lib/label-document';
import { useLabelStore } from '@/stores/label-store';

export {
  buildFitLabelDocument,
  placeFitLabelImageMm,
  type FitLabelPlacement,
} from '@/lib/img-to-label-document';

export async function detectFitLabelCropFromUri(uri: string): Promise<FitLabelDetectedCrop> {
  let analysisUri = uri;
  let downscaled = false;
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
    let width: number | undefined;
    let height: number | undefined;
    try {
      const size = await getImagePixelSize(uri);
      width = size.width;
      height = size.height;
    } catch {
      // Crop is normalized; decoded analysis size is only a fallback.
    }
    const scaled = await downscaleImageUriToMaxEdge(uri, FIT_LABEL_ANALYSIS_MAX_EDGE_PX);
    analysisUri = scaled.uri;
    downscaled = scaled.downscaled;
    const decoded = await decodeGalleryImage(analysisUri);
    return {
      ...detectFitLabelCrop(decoded.gray),
      width: width ?? decoded.normalizedWidth,
      height: height ?? decoded.normalizedHeight,
    };
  } catch {
    return { crop: FULL_CROP, certain: false };
  } finally {
    if (downscaled && analysisUri !== uri) {
      await FileSystem.deleteAsync(analysisUri, { idempotent: true }).catch(() => undefined);
    }
  }
}

export async function prepareFitLabelSource(params: {
  sourceKind: 'image' | 'pdf';
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  pdfUri?: string | null;
  pdfPageIndex?: number;
  crop: NormalizedCrop | null;
  outputDpi: number;
}): Promise<{
  uri: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  crop: NormalizedCrop;
  originalUri: string;
}> {
  const crop = params.crop ?? FULL_CROP;
  if (params.sourceKind === 'pdf') {
    if (!params.pdfUri) throw new Error('Choose a PDF page first.');
    const page = await cropPdfPageToPngUri(params.pdfUri, params.pdfPageIndex ?? 0, crop, params.outputDpi);
    return {
      uri: page.uri,
      width: page.width,
      height: page.height,
      sourceWidth: page.sourceWidth,
      sourceHeight: page.sourceHeight,
      crop,
      originalUri: params.pdfUri,
    };
  }
  if (isFullSourceCrop(crop)) {
    return {
      uri: params.imageUri,
      width: params.imageWidth,
      height: params.imageHeight,
      sourceWidth: params.imageWidth,
      sourceHeight: params.imageHeight,
      crop: FULL_CROP,
      originalUri: params.imageUri,
    };
  }
  const cropped = await applyImageCrop(params.imageUri, params.imageWidth, params.imageHeight, crop, {
    format: 'png',
  });
  return {
    uri: cropped.uri,
    width: cropped.width,
    height: cropped.height,
    sourceWidth: params.imageWidth,
    sourceHeight: params.imageHeight,
    crop,
    originalUri: params.imageUri,
  };
}

export async function applyFitLabelToEditor(params: {
  sourceKind: 'image' | 'pdf';
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  pdfUri?: string | null;
  pdfPageIndex?: number;
  crop: NormalizedCrop | null;
  widthMm: number;
  heightMm: number;
  fitMode: FitMode;
  outputDpi: number;
  paperType?: PaperType;
  orientation?: LabelOrientation;
}): Promise<LabelDocument> {
  const source = await prepareFitLabelSource(params);
  assertFitLabelExtract({
    sourceWidth: source.sourceWidth,
    sourceHeight: source.sourceHeight,
    crop: source.crop,
    extractWidth: source.width,
    extractHeight: source.height,
  });
  const ingested = await ingestFitLabelImage({
    uri: source.uri,
    width: source.width,
    height: source.height,
    originalUri: source.originalUri,
    copyPrintBytes: !/\.jpe?g(?:\?|#|$)/i.test(source.uri) || fitLabelPrintCanCopyBytes(source.uri, source.crop),
  });
  const doc = buildFitLabelDocument({
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    ingested,
    fitMode: params.fitMode,
    paperType: params.paperType,
    orientation: params.orientation,
  });
  useLabelStore.getState().upsertDocument(doc);
  return doc;
}
