import { collectImageFileUris } from '@/lib/editor/image-ingest';
import { migrateDocumentBorders } from '@/lib/border-geometry';
import type { LabelDocument } from '@/lib/label-document';
import {
  deleteSezprintFile,
  ensureSezprintDir,
  readSezprintText,
  writeTextIntoSezprint,
} from '@/lib/user-files/root';
import type { PrintHistoryEntry } from '@/lib/print-history/types';

function snapshotFileName(id: string): string {
  return `${id}.sezlabel.json`;
}

export async function persistHistorySnapshot(id: string, document: LabelDocument): Promise<void> {
  await writeTextIntoSezprint('print-history', snapshotFileName(id), JSON.stringify(document));
}

export async function readHistorySnapshot(id: string): Promise<LabelDocument | null> {
  const dir = await ensureSezprintDir('print-history');
  const raw = await readSezprintText(`${dir}${snapshotFileName(id)}`);
  if (!raw) return null;
  try {
    return migrateDocumentBorders(JSON.parse(raw) as LabelDocument);
  } catch {
    return null;
  }
}

export async function deleteHistorySnapshot(id: string): Promise<void> {
  const dir = await ensureSezprintDir('print-history');
  await deleteSezprintFile(`${dir}${snapshotFileName(id)}`);
}

/** Image URIs still needed for on-device history previews (not tied to live labels). */
export async function collectPrintHistoryImageUris(entries: PrintHistoryEntry[]): Promise<string[]> {
  const uris = new Set<string>();
  for (const entry of entries) {
    const snapId = entry.snapshotFileId ?? (entry.documentSnapshot ? entry.id : null);
    if (!snapId) continue;
    const doc =
      entry.documentSnapshot ??
      (await readHistorySnapshot(snapId).catch(() => null));
    if (!doc) continue;
    const groups = [doc.elements];
    if (doc.ups?.panels) groups.push(...doc.ups.panels);
    for (const uri of collectImageFileUris(groups)) uris.add(uri);
  }
  return [...uris];
}

/** Move inline AsyncStorage snapshots onto disk and drop bulky fields from memory. */
export async function migrateInlineSnapshotsToFiles(entries: PrintHistoryEntry[]): Promise<PrintHistoryEntry[]> {
  const next: PrintHistoryEntry[] = [];
  for (const entry of entries) {
    if (entry.documentSnapshot) {
      const fileId = entry.snapshotFileId ?? entry.id;
      await persistHistorySnapshot(fileId, entry.documentSnapshot);
      const { documentSnapshot: _removed, ...rest } = entry;
      next.push({ ...rest, snapshotFileId: fileId });
      continue;
    }
    next.push(entry);
  }
  return next;
}
