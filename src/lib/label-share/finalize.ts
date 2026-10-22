/**
 * Turn a parsed .sezlabel into a saved-label document. Pure: the native step writes the files first
 * and passes in where each one ended up. The document is written as-is after the app's existing
 * migrations. normalizeDocumentElements and patchLabelDocument are never called.
 */

import { migrateDocumentBorders } from '@/lib/border-geometry';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { migrateDocumentReferenceImage } from '@/lib/reference-image';
import type { ParsedLabel } from './import';
import { forEachElement } from './schema';

export type PlacedImage = {
  /** Full-resolution print copy. */
  printUri: string;
  /** Working copy for the canvas (the same file when no downscale was needed). */
  uri: string;
  workingWidthPx: number;
  workingHeightPx: number;
  widthPx: number;
  heightPx: number;
  /** File name under sezprint/images (used for the guide photo). */
  fileName: string;
};

export type Placement = {
  id: string;
  name: string;
  now: number;
  /** asset path -> where the picture was written */
  images: Map<string, PlacedImage>;
  /** old user-clipart id -> new local id */
  clipartIds: Map<string, string>;
};

const HTTP = /^(https?:|data:)/i;

export function finalizeDocument(parsed: ParsedLabel, placement: Placement): LabelDocument {
  const doc = JSON.parse(JSON.stringify(parsed.document)) as LabelDocument & Record<string, unknown>;

  forEachElement(doc, (el: LabelElement) => {
    const rec = el as unknown as Record<string, unknown>;
    if (el.type === 'image') {
      const placed = typeof el.printUri === 'string' ? placement.images.get(el.printUri) : undefined;
      if (placed) {
        el.printUri = placed.printUri;
        el.uri = placed.uri;
        el.workingWidthPx = placed.workingWidthPx;
        el.workingHeightPx = placed.workingHeightPx;
      } else {
        delete rec.printUri;
        // No file: only a data-bound picture is allowed to have an empty uri, and it was checked on parse.
        el.uri = typeof el.uri === 'string' && !HTTP.test(el.uri) && !el.uri.startsWith('assets/') ? el.uri : '';
      }
    } else if (el.type === 'clipart') {
      const mapped = placement.clipartIds.get(el.clipartId);
      if (mapped) el.clipartId = mapped;
    }
  });

  if (doc.background?.type === 'image') {
    const placed = placement.images.get(doc.background.uri);
    if (placed) doc.background = { type: 'image', uri: placed.printUri };
    else delete doc.background;
  }
  if (doc.referenceImage) {
    const placed = placement.images.get(doc.referenceImage.fileName);
    if (placed) {
      doc.referenceImage = {
        ...doc.referenceImage,
        fileName: placed.fileName,
        widthPx: placed.widthPx,
        heightPx: placed.heightPx,
      };
    } else {
      delete doc.referenceImage;
    }
  }
  if (doc.bulk) delete (doc.bulk as unknown as Record<string, unknown>).excelFileId;
  if (doc.settings) delete (doc.settings as unknown as Record<string, unknown>).dataSourceFileId;

  const labelDoc: LabelDocument = {
    ...(doc as LabelDocument),
    id: placement.id,
    name: placement.name,
    groupId: null,
    createdAt: placement.now,
    updatedAt: placement.now,
  };
  return migrateDocumentReferenceImage(migrateDocumentBorders(labelDoc));
}

/** "Name", then "Name (2)", "Name (3)"… against the labels already saved. */
export function uniqueLabelName(name: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const base = name.trim() || 'Imported label';
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}
