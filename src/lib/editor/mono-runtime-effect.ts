import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

import { MONO_IMAGE_SKSL } from '@/lib/editor/image-mono';

let cached: SkRuntimeEffect | null | undefined;

/** Compile once. Null when the device cannot build the mono preview shader. */
export function monoImageRuntimeEffect(): SkRuntimeEffect | null {
  if (cached !== undefined) return cached;
  try {
    cached = Skia.RuntimeEffect.Make(MONO_IMAGE_SKSL);
  } catch {
    cached = null;
  }
  return cached;
}
