import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  cropNormToPixels,
  imageCropSaveOptions,
  type ImageCropFormat,
  type NormalizedCrop,
} from '@/lib/editor/image-crop-math';

export type { ImageCropFormat };

export async function inspectImagePixelSize(
  uri: string,
): Promise<{ width: number; height: number }> {
  const ctx = ImageManipulator.manipulate(uri);
  const rendered = await ctx.renderAsync();
  const width = Math.max(1, rendered.width || 1);
  const height = Math.max(1, rendered.height || 1);
  try {
    rendered.release?.();
  } catch {
    // Native refs may already be gone.
  }
  try {
    ctx.release?.();
  } catch {
    // Native refs may already be gone.
  }
  return { width, height };
}

export async function applyImageCrop(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
  crop: NormalizedCrop,
  options?: { format?: ImageCropFormat },
): Promise<{ uri: string; width: number; height: number }> {
  const bakeCtx = ImageManipulator.manipulate(sourceUri);
  const baked = await bakeCtx.renderAsync();
  const bakedWidth = Math.max(1, baked.width || sourceWidth || 1);
  const bakedHeight = Math.max(1, baked.height || sourceHeight || 1);
  const { originX, originY, width, height } = cropNormToPixels(crop, bakedWidth, bakedHeight);

  const cropCtx = ImageManipulator.manipulate(baked);
  cropCtx.crop({ originX, originY, width, height });
  const cropped = await cropCtx.renderAsync();
  const save = imageCropSaveOptions(options?.format);
  const saved = await cropped.saveAsync({
    compress: save.compress,
    format: save.format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG,
  });
  const out = {
    uri: saved.uri,
    width: cropped.width || width,
    height: cropped.height || height,
  };
  try {
    cropped.release?.();
    baked.release?.();
    cropCtx.release?.();
    bakeCtx.release?.();
  } catch {
    // Native refs may already be gone.
  }
  return out;
}

export async function resolveImageDimensions(
  uri: string,
  fallbackWidth?: number,
  fallbackHeight?: number,
): Promise<{ width: number; height: number }> {
  try {
    return await inspectImagePixelSize(uri);
  } catch {
    if (fallbackWidth && fallbackHeight && fallbackWidth > 0 && fallbackHeight > 0) {
      return { width: fallbackWidth, height: fallbackHeight };
    }
    return { width: fallbackWidth || 1, height: fallbackHeight || 1 };
  }
}
