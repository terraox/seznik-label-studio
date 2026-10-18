import type { LabelElement } from '@/lib/label-document';
import {
  DEFAULT_IMAGE_THRESHOLD,
  normalizeImageSettings,
  type ImageSettings,
} from '@/printing/raster/image-modes';

type ImageEl = Extract<LabelElement, { type: 'image' }>;

/**
 * The image's new print settings, or null when none were ever set. Null means "print exactly as
 * before": the legacy colorMode / grayThreshold / antiColor path runs and nothing here touches it.
 */
export function modedImageSettings(el: ImageEl): ImageSettings | null {
  const touched =
    el.imageMode !== undefined ||
    el.threshold !== undefined ||
    el.brightness !== undefined ||
    el.contrast !== undefined ||
    el.invert !== undefined;
  if (!touched) return null;
  return normalizeImageSettings({
    mode: el.imageMode,
    threshold: el.threshold ?? el.grayThreshold ?? DEFAULT_IMAGE_THRESHOLD,
    brightness: el.brightness,
    contrast: el.contrast,
    // The existing Anti-color switch keeps working: both flip the result.
    invert: (el.invert === true) !== (el.antiColor === true),
  });
}

/** Tiled images keep the old path. */
export function usesModedPrint(el: LabelElement): boolean {
  return el.type === 'image' && !el.tile && modedImageSettings(el) !== null;
}
