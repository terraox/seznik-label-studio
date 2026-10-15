import { collectImageFileUris } from '@/lib/editor/image-ingest';
import { sweepEditorImageFiles } from '@/lib/editor/image-ingest-native';
import { collectPrintHistoryImageUris } from '@/lib/print-history/snapshot-file';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { collectReferenceImageKeepUris } from '@/lib/reference-image';
import { deleteSezprintFile, ensureSezprintDir, writeTextIntoSezprint } from '@/lib/user-files/root';
import { usePrintHistoryStore } from '@/stores/print-history-store';

function elementGroups(docs: LabelDocument[]): LabelElement[][] {
  const groups: LabelElement[][] = [];
  for (const doc of docs) {
    groups.push(doc.elements);
    if (doc.ups?.panels) groups.push(...doc.ups.panels);
  }
  return groups;
}

export async function persistLabelFile(doc: LabelDocument): Promise<void> {
  await writeTextIntoSezprint('labels', `${doc.id}.sezlabel.json`, JSON.stringify(doc));
}

export async function deleteLabelFile(id: string): Promise<void> {
  const dir = await ensureSezprintDir('labels');
  await deleteSezprintFile(`${dir}${id}.sezlabel.json`);
}

/** Delete sezprint images that none of `docs` (and no print-history snapshot) still names. */
export async function sweepUnusedEditorImages(docs: LabelDocument[]): Promise<void> {
  const keepFromLabels = collectImageFileUris(elementGroups(docs));
  const keepRefs = collectReferenceImageKeepUris(docs);
  const keepFromHistory = await collectPrintHistoryImageUris(
    usePrintHistoryStore.getState().entries,
  );
  await sweepEditorImageFiles([...keepFromLabels, ...keepRefs, ...keepFromHistory]);
}

/** Remove the label file and any sezprint images that no remaining label uses. */
export async function cleanupDeletedLabel(
  id: string,
  remaining: LabelDocument[],
): Promise<void> {
  await deleteLabelFile(id);
  await sweepUnusedEditorImages(remaining);
}
