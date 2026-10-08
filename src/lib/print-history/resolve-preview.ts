import type { LabelDocument } from '@/lib/label-document';
import type { PrintHistoryEntry } from '@/lib/print-history/types';
import { readHistorySnapshot } from '@/lib/print-history/snapshot-file';

/** Prefer frozen print-time layout over the live label library. */
export function resolveHistoryLabelDocument(
  entry: PrintHistoryEntry,
  getDocument: (id: string) => LabelDocument | undefined,
): LabelDocument | null {
  if (entry.documentSnapshot) return entry.documentSnapshot;
  if (entry.documentId) {
    const live = getDocument(entry.documentId);
    if (live) return live;
  }
  return null;
}

export async function resolveHistoryLabelDocumentAsync(
  entry: PrintHistoryEntry,
  getDocument: (id: string) => LabelDocument | undefined,
): Promise<LabelDocument | null> {
  if (entry.documentSnapshot) return entry.documentSnapshot;
  if (entry.snapshotFileId) {
    const fromDisk = await readHistorySnapshot(entry.snapshotFileId);
    if (fromDisk) return fromDisk;
  }
  if (entry.documentId) {
    return getDocument(entry.documentId) ?? null;
  }
  return null;
}
