import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import type {
  FilePickerDiagnostics,
  PickLocalDocumentOptions,
  PickedLocalDocument,
} from './types';

export * from './types';

/** Keep in sync with src/lib/file-import/pick-local-constants.ts */
export const LOCAL_FILE_PICKER_MAX_BYTES = 100 * 1024 * 1024;

type NativeLocalFilePicker = {
  getFilePickerDiagnostics(): Promise<FilePickerDiagnostics>;
  pickLocalDocumentAsync(options: PickLocalDocumentOptions): Promise<{
    canceled: boolean;
    asset?: PickedLocalDocument | null;
  }>;
};

let cached: NativeLocalFilePicker | null | undefined;

function getNative(): NativeLocalFilePicker | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeLocalFilePicker>('LocalFilePicker');
  } catch {
    cached = null;
  }
  return cached;
}

export function isLocalFilePickerAvailable(): boolean {
  return getNative() != null;
}

export async function getFilePickerDiagnostics(): Promise<FilePickerDiagnostics | null> {
  const mod = getNative();
  if (!mod) return null;
  return mod.getFilePickerDiagnostics();
}

export async function pickLocalDocumentAsync(
  options: PickLocalDocumentOptions,
): Promise<PickedLocalDocument | null> {
  const mod = getNative();
  if (!mod) {
    throw new Error('Local file picker is only available on Android dev builds.');
  }

  try {
    const result = await mod.pickLocalDocumentAsync({
      mimeTypes: options.mimeTypes,
      multiple: options.multiple ?? false,
      maxBytes: options.maxBytes ?? LOCAL_FILE_PICKER_MAX_BYTES,
    });
    if (result.canceled || !result.asset) return null;
    return result.asset;
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === 'FILE_TOO_LARGE') {
      throw new Error('That file is larger than 100 MB.');
    }
    throw error;
  }
}
