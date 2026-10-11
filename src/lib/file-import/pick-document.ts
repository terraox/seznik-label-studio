import * as DocumentPicker from 'expo-document-picker';
import { pickLocalDocumentAsync } from 'local-file-picker';
import { Platform } from 'react-native';

import {
  DOCUMENT_PRESETS,
  extensionFromMime,
  extensionFromName,
  type DocumentPreset,
} from '@/lib/file-import/mime-presets';
import { buildDocumentPickerRequest } from '@/lib/file-import/pick-document-options';
import { mapLocalPickedDocument } from '@/lib/file-import/pick-document-local-map';
import { shouldUseLocalFilePicker } from '@/lib/file-import/pick-document-routing';
import type { PickedDocument } from '@/lib/file-import/pick-document-types';
import type { FileSourceChoice } from '@/lib/file-import/use-file-source-sheet';

export type { PickedDocument } from '@/lib/file-import/pick-document-types';
export { buildDocumentPickerRequest, LOCAL_INITIAL_FOLDER } from '@/lib/file-import/pick-document-options';

/**
 * Open the system document picker.
 * - `local` (Android documents): native local-file-picker module.
 * - `local` (images): gallery via pick-image.tsx.
 * - `drive`: system picker with cloud providers (Google Drive, iCloud, etc.).
 */
export async function pickDocumentAsset(options: {
  preset: DocumentPreset;
  source: FileSourceChoice;
}): Promise<PickedDocument> {
  const preset = options.preset === 'any' ? null : DOCUMENT_PRESETS[options.preset];

  if (shouldUseLocalFilePicker(options.source, Platform.OS)) {
    try {
      const picked = await pickLocalDocumentAsync({
        mimeTypes: preset?.mimeTypes ?? ['*/*'],
      });
      return mapLocalPickedDocument(picked, options.preset);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open that file.';
      throw new Error(message);
    }
  }

  const result = await DocumentPicker.getDocumentAsync(
    buildDocumentPickerRequest({ ...options, platform: Platform.OS }),
  );

  if (result.canceled || !result.assets?.length) {
    return { ok: false, reason: 'cancelled' };
  }

  const file = result.assets[0];
  let extension = extensionFromName(file.name);
  if (!extension) extension = extensionFromMime(file.mimeType);
  if (preset && !preset.extensions.has(extension)) {
    return { ok: false, reason: 'invalid' };
  }

  const name = extension && !extensionFromName(file.name) ? `${file.name}.${extension}` : file.name || `file.${extension || 'bin'}`;
  return {
    ok: true,
    name,
    uri: file.uri,
    size: file.size,
    extension,
  };
}
