import { Platform } from 'react-native';

import { OCR_ERROR_MESSAGES, OcrError, isOcrError } from './errors';
import type { NativeOcrResult, OcrEngine } from './types';

type MlKitTextRecognition = {
  recognize: (imageURL: string, script?: string) => Promise<NativeOcrResult>;
};

let cachedModule: MlKitTextRecognition | null | undefined;

function linkingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes("doesn't seem to be linked") ||
    message.includes('Expo managed workflow') ||
    message.includes('Native module') ||
    message.includes('Requiring unknown module')
  );
}

function loadMlKit(): MlKitTextRecognition {
  if (cachedModule) return cachedModule;
  if (cachedModule === null) {
    throw new OcrError('engine_unavailable', OCR_ERROR_MESSAGES.engine_unavailable);
  }

  if (Platform.OS === 'web') {
    cachedModule = null;
    throw new OcrError('engine_unavailable', OCR_ERROR_MESSAGES.engine_unavailable);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('@react-native-ml-kit/text-recognition').default as MlKitTextRecognition;
    if (typeof loaded?.recognize !== 'function') {
      cachedModule = null;
      throw new OcrError('engine_unavailable', OCR_ERROR_MESSAGES.engine_unavailable);
    }
    cachedModule = loaded;
    return loaded;
  } catch (error) {
    if (isOcrError(error)) throw error;
    cachedModule = null;
    throw new OcrError('engine_unavailable', OCR_ERROR_MESSAGES.engine_unavailable, error);
  }
}

export async function recognizeWithMlKit(uri: string): Promise<NativeOcrResult> {
  const native = loadMlKit();
  try {
    return await native.recognize(uri, 'Latin');
  } catch (error) {
    if (isOcrError(error)) throw error;
    if (linkingError(error)) {
      cachedModule = null;
      throw new OcrError('engine_unavailable', OCR_ERROR_MESSAGES.engine_unavailable, error);
    }
    throw new OcrError('recognition_failed', OCR_ERROR_MESSAGES.recognition_failed, error);
  }
}

export const mlKitEngine: OcrEngine = {
  recognize: recognizeWithMlKit,
};
