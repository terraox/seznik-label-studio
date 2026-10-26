import { DOCUMENT_PRESETS, extensionFromName } from '@/lib/file-import/mime-presets';
import { isLabelFileName } from '@/lib/label-share/file-name';
import type { IncomingFileKind } from '@/stores/incoming-file-store';

/** What a received file is, from its name, or null when the app cannot open it. */
export function classifyIncomingFile(name: string): IncomingFileKind | null {
  if (isLabelFileName(name)) return 'label';
  const extension = extensionFromName(name);
  if (DOCUMENT_PRESETS.excel.extensions.has(extension)) return 'excel';
  if (DOCUMENT_PRESETS.pdf.extensions.has(extension)) return 'pdf';
  return null;
}
