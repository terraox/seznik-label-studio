import { OCR_ERROR_MESSAGES, OcrError, isOcrError } from './errors';
import { assertRecognizableImageUri } from './image-uri';
import { mapNativeOcrResult } from './map-result';
import type { OcrRecognitionResult, OcrRecognizeDeps } from './types';

let inFlight: Promise<OcrRecognitionResult> | null = null;

export function resetOcrInFlightForTests(): void {
  inFlight = null;
}

async function loadDefaultDeps(): Promise<OcrRecognizeDeps> {
  const [{ mlKitEngine }, preprocess] = await Promise.all([
    import('./engine'),
    import('./preprocess'),
  ]);
  return {
    engine: mlKitEngine,
    inspectImage: preprocess.inspectOcrImage,
    prepareImage: preprocess.prepareImageForOcr,
    cleanupPreparedImage: preprocess.cleanupPreparedImage,
  };
}

async function runRecognition(
  uri: string,
  deps: OcrRecognizeDeps,
): Promise<OcrRecognitionResult> {
  const sourceUri = assertRecognizableImageUri(uri);

  let imageSize;
  try {
    imageSize = await deps.inspectImage(sourceUri);
  } catch (error) {
    if (isOcrError(error)) throw error;
    throw new OcrError('invalid_image', OCR_ERROR_MESSAGES.invalid_image, error);
  }

  if (!imageSize.width || !imageSize.height) {
    throw new OcrError('invalid_image', OCR_ERROR_MESSAGES.invalid_image);
  }

  const prepared = await deps.prepareImage(sourceUri, imageSize);
  try {
    const native = await deps.engine.recognize(prepared.uri);
    const frameScale =
      prepared.width > 0 ? imageSize.width / prepared.width : 1;
    return mapNativeOcrResult(native, imageSize, frameScale);
  } catch (error) {
    if (isOcrError(error)) throw error;
    throw new OcrError('recognition_failed', OCR_ERROR_MESSAGES.recognition_failed, error);
  } finally {
    if (deps.cleanupPreparedImage) {
      await deps.cleanupPreparedImage(prepared);
    }
  }
}

export async function recognizeImage(
  uri: string,
  deps?: OcrRecognizeDeps,
): Promise<OcrRecognitionResult> {
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    const resolved = deps ?? (await loadDefaultDeps());
    return runRecognition(uri, resolved);
  })();

  inFlight = task;
  try {
    return await task;
  } finally {
    if (inFlight === task) {
      inFlight = null;
    }
  }
}
