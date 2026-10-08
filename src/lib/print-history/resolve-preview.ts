import type { LabelDocument } from '@/lib/label-document';
import type { PrintHistoryEntry } from '@/lib/print-history/types';

export function resolveHistoryLabelDocument(
  entry: PrintHistoryEntry,
  getDocument: (id: string) => LabelDocument | undefined,
): LabelDocument | null {
  if (entry.documentSnapshot) return entry.documentSnapshot;
  if (entry.documentId) {
    return getDocument(entry.documentId) ?? null;
  }
  return null;
}
