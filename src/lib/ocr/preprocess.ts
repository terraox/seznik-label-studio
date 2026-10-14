import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { OCR_ERROR_MESSAGES, OcrError } from './errors';
import type { OcrImageSize, PreparedOcrImage } from './types';
import { ocrWorkingSize } from './working-size';

export { OCR_MAX_EDGE_PX, ocrWorkingSize } from './working-size';
export { assertRecognizableImageUri } from './image-uri';

export function inspectOcrImage(uri: string): Promise<OcrImageSize> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (!width || !height) {
          reject(new OcrError('invalid_image', OCR_ERROR_MESSAGES.invalid_image));
          return;
        }
        resolve({ width, height });
      },
      () => {
        reject(new OcrError('invalid_image', OCR_ERROR_MESSAGES.invalid_image));
      },
    );
  });
}

export async function prepareImageForOcr(
  uri: string,
  size: OcrImageSize,
): Promise<PreparedOcrImage> {
  const working = ocrWorkingSize(size.width, size.height);
  if (!working.downscaled) {
    return {
      uri,
      width: size.width,
      height: size.height,
      temporary: false,
    };
  }

  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: working.widthPx, height: working.heightPx });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    return {
      uri: saved.uri,
      width: working.widthPx,
      height: working.heightPx,
      temporary: true,
    };
  } catch {
    return {
      uri,
      width: size.width,
      height: size.height,
      temporary: false,
    };
  }
}

export async function cleanupPreparedImage(prepared: PreparedOcrImage): Promise<void> {
  if (!prepared.temporary) return;
  try {
    await FileSystem.deleteAsync(prepared.uri, { idempotent: true });
  } catch {
    // Best-effort cleanup of the downscaled working copy.
  }
}
