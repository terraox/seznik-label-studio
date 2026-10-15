import {
  DOCUMENT_PRESETS,
  type DocumentPreset,
} from '@/lib/file-import/mime-presets';
import type { FileSourceChoice } from '@/lib/file-import/use-file-source-sheet';

/** Android local picker opens at Downloads when supported (API 26+). */
export const LOCAL_INITIAL_FOLDER = 'downloads' as const;

export type DocumentPickerRequest = {
  type: string[];
  copyToCacheDirectory: boolean;
  multiple: boolean;
  localOnly: boolean;
  initialFolder?: typeof LOCAL_INITIAL_FOLDER;
};

/** Build expo-document-picker options for Local vs Drive. */
export function buildDocumentPickerRequest(options: {
  preset: DocumentPreset;
  source: FileSourceChoice;
  /** Pass `Platform.OS`. Accepted for callers; the MIME list is the preset list on every platform. */
  platform?: string;
}): DocumentPickerRequest {
  const preset = options.preset === 'any' ? null : DOCUMENT_PRESETS[options.preset];
  const presetTypes = preset?.mimeTypes ?? ['*/*'];
  const type = [...presetTypes];
  const request: DocumentPickerRequest = {
    type,
    copyToCacheDirectory: true,
    multiple: false,
    localOnly: options.source === 'local',
  };
  if (options.source === 'local') {
    request.initialFolder = LOCAL_INITIAL_FOLDER;
  }
  return request;
}
