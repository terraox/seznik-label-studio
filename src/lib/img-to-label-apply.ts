import { applyImageCrop } from '@/lib/editor/apply-image-crop';
import { ingestEditorImage } from '@/lib/editor/image-ingest-native';
import { FULL_CROP, type NormalizedCrop } from '@/lib/editor/image-crop-math';
import { cropPdfPageToPngUri } from '@/lib/img-to-label-content';
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

export async function prepareFitLabelSource(params: {
  sourceKind: 'image' | 'pdf';
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  pdfUri?: string | null;
  pdfPageIndex?: number;
  crop: NormalizedCrop | null;
  outputDpi: number;
}): Promise<{ uri: string; width: number; height: number }> {
  const crop = params.crop ?? FULL_CROP;
  if (params.sourceKind === 'pdf') {
    if (!params.pdfUri) throw new Error('Choose a PDF page first.');
    return cropPdfPageToPngUri(params.pdfUri, params.pdfPageIndex ?? 0, crop, params.outputDpi);
  }
  if (isFullSourceCrop(crop)) {
    return { uri: params.imageUri, width: params.imageWidth, height: params.imageHeight };
  }
  return applyImageCrop(params.imageUri, params.imageWidth, params.imageHeight, crop, {
    format: 'png',
  });
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
  const ingested = await ingestEditorImage({
    uri: source.uri,
    width: source.width,
    height: source.height,
    printFormat: 'png',
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
