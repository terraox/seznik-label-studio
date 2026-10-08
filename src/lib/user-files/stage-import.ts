import { generateId } from '@/lib/label-document';
import { extensionFromName } from '@/lib/file-import/mime-presets';
import { copyImportIntoSezprint } from '@/lib/user-files/root';
import { isInsideSezprint, safeImportFileName, type SezprintSubdir } from '@/lib/user-files/paths';

const FALLBACK_EXT: Partial<Record<SezprintSubdir, string>> = {
  excel: 'xlsx',
  pdf: 'pdf',
  fonts: 'ttf',
  clipart: 'svg',
  images: 'jpg',
  labels: 'json',
};

/** Copy a picker URI into sezprint before it is stored. Already-staged files are returned as-is. */
export async function stageImportedFile(
  subdir: SezprintSubdir,
  sourceUri: string,
  fileName: string,
): Promise<string> {
  if (isInsideSezprint(sourceUri, subdir)) return sourceUri;
  const ext = extensionFromName(fileName) || FALLBACK_EXT[subdir] || 'bin';
  const id = generateId(subdir);
  return copyImportIntoSezprint(subdir, sourceUri, safeImportFileName(id, fileName || `file.${ext}`, ext));
}
