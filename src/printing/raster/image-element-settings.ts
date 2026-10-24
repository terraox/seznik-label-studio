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
 * The one exception is the legacy Halftone colour mode, which runs as the Ordered mode.
 */
export function modedImageSettings(el: ImageEl): ImageSettings | null {
  const touched =
    el.imageMode !== undefined ||
    el.threshold !== undefined ||
    el.brightness !== undefined ||
    el.contrast !== undefined ||
    el.invert !== undefined;
  if (!touched) {
    // Halftone is an ordered-dot screen made at printer dots, so the canvas and the print match.
    if (el.colorMode === 'Halftone' && !el.tile) {
      return normalizeImageSettings({
        mode: 'ordered',
        threshold: DEFAULT_IMAGE_THRESHOLD,
        // The ordered screen has no cutoff, so the Gray Threshold slider moves the tone instead:
        // higher = darker, the same direction as B & W.
        brightness: -((el.grayThreshold ?? DEFAULT_IMAGE_THRESHOLD) - DEFAULT_IMAGE_THRESHOLD) * (100 / 127),
        invert: el.antiColor === true,
      });
    }
    return null;
  }
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
