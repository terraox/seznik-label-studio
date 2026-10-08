import { collectImageFileUris } from '@/lib/editor/image-ingest';
import { sweepEditorImageFiles } from '@/lib/editor/image-ingest-native';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { deleteSezprintFile, ensureSezprintDir, writeTextIntoSezprint } from '@/lib/user-files/root';

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

/** Remove the label file and any sezprint images that no remaining label uses. */
export async function cleanupDeletedLabel(
  id: string,
  remaining: LabelDocument[],
): Promise<void> {
  await deleteLabelFile(id);
  await sweepEditorImageFiles(collectImageFileUris(elementGroups(remaining)));
}
