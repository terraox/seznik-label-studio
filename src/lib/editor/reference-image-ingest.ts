/**
 * Store an Image-to-label guide under sezprint/images and return only the file name.
 * Printable image elements keep the separate 2000 px ingest path.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { generateId, type LabelReferenceImage } from '@/lib/label-document';
import {
  referenceImageStoredFormatFromPick,
  referenceWorkingSize,
} from '@/lib/reference-image';
import { copyImportIntoSezprint } from '@/lib/user-files/root';

export async function ingestReferenceImage(source: {
  uri: string;
  width?: number;
  height?: number;
  name?: string;
}): Promise<LabelReferenceImage> {
  const stored = referenceImageStoredFormatFromPick(source.name, source.uri);
  if (!stored) {
    throw new Error('Use a PNG or JPG image.');
  }

  const context = ImageManipulator.manipulate(source.uri);
  const originalRef = await context.renderAsync();
  const widthPx = originalRef.width || source.width || 1;
  const heightPx = originalRef.height || source.height || 1;
  const working = referenceWorkingSize(widthPx, heightPx);
  const png = stored === 'png';

  let savedUri: string;
  let outW = widthPx;
  let outH = heightPx;
  if (working.downscaled) {
    const resized = ImageManipulator.manipulate(source.uri);
    resized.resize({ width: working.widthPx, height: working.heightPx });
    const resizedRef = await resized.renderAsync();
    const saved = await resizedRef.saveAsync({
      compress: png ? 1 : 0.92,
      format: png ? SaveFormat.PNG : SaveFormat.JPEG,
    });
    savedUri = saved.uri;
    outW = working.widthPx;
    outH = working.heightPx;
  } else {
    const saved = await originalRef.saveAsync({
      compress: png ? 1 : 0.92,
      format: png ? SaveFormat.PNG : SaveFormat.JPEG,
    });
    savedUri = saved.uri;
  }

  const fileName = `${generateId('ref')}.${png ? 'png' : 'jpg'}`;
  await copyImportIntoSezprint('images', savedUri, fileName);
  return { fileName, widthPx: outW, heightPx: outH };
}
