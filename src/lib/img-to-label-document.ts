import type { NormalizedCrop } from '@/lib/editor/image-crop-math';
import type { FitMode } from '@/lib/img-to-label-engine';
import { containFitImageOnLabel } from '@/lib/label-coordinate-system';
import {
  createLabelDocument,
  generateId,
  type LabelDocument,
  type LabelElement,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import { clampLabelMm } from '@/lib/label-geometry';

/** Same floor as pdf-editor `EXPORT_DPI`. */
export const FIT_LABEL_EXPORT_DPI = 300;

export type FitLabelIngestedImage = {
  previewUri: string;
  printUri: string;
  widthPx: number;
  heightPx: number;
  workingWidthPx: number;
  workingHeightPx: number;
  originalAspect: number;
};

export type FitLabelPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
  contentFit: 'contain' | 'cover' | 'fill';
  aspectRatioLocked: boolean;
};

/** Final Fit Label PDF raster: never below export DPI, never below the printer. */
export function fitLabelRasterDpi(printerDpi: number, exportDpi = FIT_LABEL_EXPORT_DPI): number {
  const printer = Number.isFinite(printerDpi) && printerDpi > 0 ? printerDpi : exportDpi;
  return Math.max(exportDpi, printer);
}

export function isFullSourceCrop(crop: NormalizedCrop | null | undefined): boolean {
  if (!crop) return true;
  return crop.w >= 0.98 && crop.h >= 0.98 && crop.x <= 0.02 && crop.y <= 0.02;
}

/** Selected page only, at least export DPI, never a preview upscale. */
export function fitLabelPdfCropTarget(
  uri: string,
  pageIndex: number,
  dpi: number,
): { uri: string; pageIndex: number; dpi: number } {
  return {
    uri,
    pageIndex: Math.max(0, Math.floor(pageIndex)),
    dpi: fitLabelRasterDpi(dpi),
  };
}

export function placeFitLabelImageMm(
  widthMm: number,
  heightMm: number,
  imageWidthPx: number,
  imageHeightPx: number,
  fitMode: FitMode,
): FitLabelPlacement {
  const size = clampLabelMm(widthMm, heightMm);
  if (fitMode === 'cover') {
    return {
      left: 0,
      top: 0,
      width: size.widthMm,
      height: size.heightMm,
      contentFit: 'cover',
      aspectRatioLocked: true,
    };
  }
  if (fitMode === 'stretch') {
    return {
      left: 0,
      top: 0,
      width: size.widthMm,
      height: size.heightMm,
      contentFit: 'fill',
      aspectRatioLocked: false,
    };
  }
  const box = containFitImageOnLabel(
    { widthMm: size.widthMm, heightMm: size.heightMm },
    { widthPx: imageWidthPx, heightPx: imageHeightPx },
  );
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    contentFit: 'contain',
    aspectRatioLocked: true,
  };
}

/** Re-place the Fit Label extract on a newly chosen stock so the crop fills that size. */
export function refitFitLabelDocument(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
): LabelDocument {
  const size = clampLabelMm(widthMm, heightMm);
  const image = doc.elements.find((el) => el.type === 'image' && el.fitLabelSource);
  if (!image || image.type !== 'image') {
    return { ...doc, widthMm: size.widthMm, heightMm: size.heightMm };
  }
  const fitMode: FitMode =
    image.contentFit === 'cover' ? 'cover' : image.contentFit === 'fill' ? 'stretch' : 'contain';
  const pxW = image.workingWidthPx && image.workingWidthPx > 0 ? image.workingWidthPx : 1000;
  const aspect = image.originalAspect && image.originalAspect > 0 ? image.originalAspect : pxW / 1000;
  const pxH =
    image.workingHeightPx && image.workingHeightPx > 0
      ? image.workingHeightPx
      : Math.max(1, Math.round(pxW / aspect));
  const placed = placeFitLabelImageMm(size.widthMm, size.heightMm, pxW, pxH, fitMode);
  return {
    ...doc,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    elements: doc.elements.map((el) =>
      el.id === image.id && el.type === 'image' ? { ...el, ...placed } : el,
    ),
  };
}

export function buildFitLabelDocument(params: {
  name?: string;
  widthMm: number;
  heightMm: number;
  ingested: FitLabelIngestedImage;
  fitMode: FitMode;
  paperType?: PaperType;
  orientation?: LabelOrientation;
}): LabelDocument {
  const size = clampLabelMm(params.widthMm, params.heightMm);
  const placed = placeFitLabelImageMm(
    size.widthMm,
    size.heightMm,
    params.ingested.widthPx,
    params.ingested.heightPx,
    params.fitMode,
  );
  const imgId = generateId();
  const element: LabelElement = {
    id: imgId,
    type: 'image',
    uri: params.ingested.previewUri,
    printUri: params.ingested.printUri,
    rotation: 0,
    left: placed.left,
    top: placed.top,
    width: placed.width,
    height: placed.height,
    lockMovement: false,
    needPrinting: true,
    antiColor: false,
    contentFit: placed.contentFit,
    aspectRatioLocked: placed.aspectRatioLocked,
    originalAspect: params.ingested.originalAspect,
    workingWidthPx: params.ingested.workingWidthPx,
    workingHeightPx: params.ingested.workingHeightPx,
    colorMode: 'Original',
    contentType: 'Local Image',
    fitLabelSource: true,
  };
  return createLabelDocument({
    name: params.name ?? `Fit Label ${Math.round(size.widthMm)}×${Math.round(size.heightMm)}`,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    orientation: params.orientation ?? 0,
    paperType: params.paperType ?? 'Label',
    elements: [element],
    background: { type: 'color', color: '#FFFFFF' },
  });
}
