/**
 * Editor-only reference photo for "Upload label".
 * The entered millimetre size stays the label size. This file never becomes an element.
 */

import { workingSizePx } from '@/lib/editor/image-ingest';
import type { LabelDocument, LabelReferenceImage } from '@/lib/label-document';
import { sezprintSubdirUri } from '@/lib/user-files/paths';

/** Longest side of the stored guide. Printable image elements keep their own 2000 px cap. */
export const REFERENCE_IMAGE_MAX_EDGE_PX = 2048;

/** Relative aspect difference above this shows a warning. The photo is still stretched to the label. */
export const REFERENCE_PROPORTION_TOLERANCE = 0.03;

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export function referenceWorkingSize(widthPx: number, heightPx: number) {
  return workingSizePx(widthPx, heightPx, REFERENCE_IMAGE_MAX_EDGE_PX);
}

/**
 * How the picked file is stored. PNG stays PNG. JPG stays JPG.
 * HEIC from the camera roll is saved as JPG. Anything else is refused.
 */
export function referenceImageStoredFormat(hint: string): 'png' | 'jpeg' | null {
  const lower = hint.trim().toLowerCase().split('?')[0] ?? '';
  const ext = lower.match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'heic' || ext === 'heif') return 'jpeg';
  if (lower.includes('image/png')) return 'png';
  if (lower.includes('image/jpeg') || lower.includes('image/jpg')) return 'jpeg';
  if (lower.includes('image/heic') || lower.includes('image/heif')) return 'jpeg';
  return null;
}

export function referenceImageStoredFormatFromPick(
  name: string | undefined,
  uri: string,
): 'png' | 'jpeg' | null {
  if (name) {
    const fromName = referenceImageStoredFormat(name);
    if (fromName) return fromName;
  }
  return referenceImageStoredFormat(uri);
}

/** Single file name. Rejects absolute paths, slashes, and `..`. */
export function isSafeReferenceFileName(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (!SAFE_FILE_NAME.test(name)) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes(':')) return false;
  return true;
}

export function referenceProportionDelta(
  imageWidthPx: number,
  imageHeightPx: number,
  labelWidthMm: number,
  labelHeightMm: number,
): number | null {
  if (
    !Number.isFinite(imageWidthPx) ||
    !Number.isFinite(imageHeightPx) ||
    !Number.isFinite(labelWidthMm) ||
    !Number.isFinite(labelHeightMm)
  ) {
    return null;
  }
  if (imageWidthPx <= 0 || imageHeightPx <= 0 || labelWidthMm <= 0 || labelHeightMm <= 0) return null;
  const imageRatio = imageWidthPx / imageHeightPx;
  const labelRatio = labelWidthMm / labelHeightMm;
  return Math.abs(imageRatio - labelRatio) / labelRatio;
}

/** True when the photo's shape differs from the label by more than 3%. Fit stays stretch either way. */
export function referenceProportionWarns(
  imageWidthPx: number,
  imageHeightPx: number,
  labelWidthMm: number,
  labelHeightMm: number,
  tolerance = REFERENCE_PROPORTION_TOLERANCE,
): boolean {
  const delta = referenceProportionDelta(imageWidthPx, imageHeightPx, labelWidthMm, labelHeightMm);
  if (delta == null) return false;
  const rounded = Math.round(delta * 1e6) / 1e6;
  return rounded > tolerance;
}

function readableReference(value: LabelReferenceImage | undefined): LabelReferenceImage | null {
  if (!value || typeof value !== 'object') return null;
  if (!isSafeReferenceFileName(value.fileName)) return null;
  if (!Number.isFinite(value.widthPx) || !Number.isFinite(value.heightPx)) return null;
  if (value.widthPx <= 0 || value.heightPx <= 0) return null;
  const rotationOk = value.rotation == null || Number.isFinite(value.rotation);
  const printOk = value.needPrinting == null || typeof value.needPrinting === 'boolean';
  if (rotationOk && printOk) return value;
  const rotation = Number.isFinite(value.rotation) ? value.rotation : undefined;
  return {
    fileName: value.fileName,
    widthPx: value.widthPx,
    heightPx: value.heightPx,
    ...(rotation != null ? { rotation } : {}),
    ...(value.needPrinting === true ? { needPrinting: true } : {}),
  };
}

/**
 * Old labels have no `referenceImage` and are returned as the same object.
 * A broken name or pixel size drops the field and leaves elements alone.
 */
export function migrateDocumentReferenceImage(doc: LabelDocument): LabelDocument {
  if (doc.referenceImage == null) return doc;
  const next = readableReference(doc.referenceImage);
  if (next === doc.referenceImage) return doc;
  if (next == null) {
    const { referenceImage: _drop, ...rest } = doc;
    return rest;
  }
  return { ...doc, referenceImage: next };
}

export function withReferenceImage(doc: LabelDocument, image: LabelReferenceImage): LabelDocument {
  return { ...doc, referenceImage: image };
}

export function withoutReferenceImage(doc: LabelDocument): LabelDocument {
  if (!doc.referenceImage) return doc;
  const { referenceImage: _drop, ...rest } = doc;
  return rest;
}

/** Token the image sweep already understands: a path containing `sezprint/images/` plus the file name. */
export function referenceImageKeepToken(fileName: string): string | null {
  if (!isSafeReferenceFileName(fileName)) return null;
  return `sezprint/images/${fileName}`;
}

export function collectReferenceImageKeepUris(
  docs: Array<Pick<LabelDocument, 'referenceImage'>>,
): string[] {
  const tokens: string[] = [];
  for (const doc of docs) {
    const token = doc.referenceImage ? referenceImageKeepToken(doc.referenceImage.fileName) : null;
    if (token) tokens.push(token);
  }
  return tokens;
}

export function referenceImageDisplayUri(
  fileName: string,
  documentDirectory: string | null | undefined,
): string | null {
  if (!documentDirectory || !isSafeReferenceFileName(fileName)) return null;
  return `${sezprintSubdirUri(documentDirectory, 'images')}${fileName}`;
}
