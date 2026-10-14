import {
  DOCUMENT_PRESETS,
  type DocumentPreset,
} from '@/lib/file-import/mime-presets';
import type { FileSourceChoice } from '@/lib/file-import/use-file-source-sheet';

/** Android local picker opens at Downloads when supported (API 26+). */
export const LOCAL_INITIAL_FOLDER = 'downloads' as const;

/** Native Google Sheets documents. Android Drive Excel picks only. */
export const GOOGLE_SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

/**
 * MIME types that keep Google Sheets disabled in Android's picker.
 * `application/octet-stream` makes Drive treat the request as a raw file.
 * Apple UTIs are not MIME types; a filter without `/` aborts matching
 * before the Google Sheets type is considered.
 */
const ANDROID_PICKER_MIME_BLOCKLIST = new Set(['application/octet-stream', '*/*']);

export function androidSpreadsheetMimeTypes(mimeTypes: readonly string[]): string[] {
  const cleaned: string[] = [];
  for (const mime of mimeTypes) {
    const normalized = mime.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!normalized.includes('/')) continue;
    if (ANDROID_PICKER_MIME_BLOCKLIST.has(normalized)) continue;
    if (!cleaned.includes(normalized)) cleaned.push(normalized);
  }
  return [GOOGLE_SHEETS_MIME, ...cleaned.filter((mime) => mime !== GOOGLE_SHEETS_MIME)];
}

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
  /** Pass `Platform.OS`. Omitted or non-android keeps the preset MIME list unchanged. */
  platform?: string;
}): DocumentPickerRequest {
  const preset = options.preset === 'any' ? null : DOCUMENT_PRESETS[options.preset];
  const presetTypes = preset?.mimeTypes ?? ['*/*'];
  const type =
    options.platform === 'android' && options.source === 'drive' && options.preset === 'excel'
      ? androidSpreadsheetMimeTypes(presetTypes)
      : [...presetTypes];
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
