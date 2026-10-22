/**
 * A label drawn from the PARSED document for the import screen (never from the embedded
 * preview.png, which could show something else). Pictures become small data URIs; nothing is
 * written to disk and the store is not touched.
 */

import type { LabelDocument } from '@/lib/label-document';
import { bytesToBase64 } from './base64';
import { finalizeDocument, type PlacedImage } from './finalize';
import type { ParsedLabel } from './import';

/** Pictures bigger than this are left out of the preview only (they are still imported). */
const PREVIEW_IMAGE_BYTES = 1_500_000;

export function previewDocument(parsed: ParsedLabel): LabelDocument {
  const images = new Map<string, PlacedImage>();
  for (const path of parsed.usedAssets) {
    const asset = parsed.assets.get(path);
    if (!asset || asset.kind !== 'image' || asset.bytes.length > PREVIEW_IMAGE_BYTES) continue;
    const mime = asset.ext === 'png' ? 'image/png' : asset.ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const uri = `data:${mime};base64,${bytesToBase64(asset.bytes)}`;
    images.set(path, {
      printUri: uri,
      uri,
      workingWidthPx: asset.width ?? 1,
      workingHeightPx: asset.height ?? 1,
      widthPx: asset.width ?? 1,
      heightPx: asset.height ?? 1,
      fileName: 'preview',
    });
  }
  return finalizeDocument(parsed, {
    id: 'preview',
    name: parsed.document.name,
    now: 0,
    images,
    clipartIds: new Map(),
  });
}
