import {
  DOCUMENT_PRESETS,
  extensionFromMime,
  extensionFromName,
  type DocumentPreset,
} from '@/lib/file-import/mime-presets';
import type { PickedDocument } from '@/lib/file-import/pick-document-types';

export type LocalPickedFile = {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string | null;
};

export function mapLocalPickedDocument(
  picked: LocalPickedFile | null,
  preset: DocumentPreset | 'any',
): PickedDocument {
  if (!picked) return { ok: false, reason: 'cancelled' };

  const presetConfig = preset === 'any' ? null : DOCUMENT_PRESETS[preset];
  let extension = extensionFromName(picked.name);
  if (!extension) extension = extensionFromMime(picked.mimeType);
  if (presetConfig && !presetConfig.extensions.has(extension)) {
    return { ok: false, reason: 'invalid' };
  }

  const name =
    extension && !extensionFromName(picked.name)
      ? `${picked.name}.${extension}`
      : picked.name || `file.${extension || 'bin'}`;

  return {
    ok: true,
    name,
    uri: picked.uri,
    size: picked.size,
    extension,
    mimeType: picked.mimeType ?? null,
  };
}
