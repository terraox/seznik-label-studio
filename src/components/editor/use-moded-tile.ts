import { useEffect, useState } from 'react';

import type { LabelElement } from '@/lib/label-document';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { modedImageSettings, usesModedPrint } from '@/printing/raster/image-element-settings';
import { imageSettingsKey, type PlacedTile } from '@/printing/raster/image-modes';
import { buildImageTile, imageBoxDots, loadImageSource } from '@/printing/raster/image-tiles';

type ImageEl = Extract<LabelElement, { type: 'image' }>;

function previewDpi(): number {
  try {
    return getPrinterManager().getPrintDpi() || 304;
  } catch {
    return 304;
  }
}

/**
 * The finished dots of an image set to a print mode, made by the same pipeline the printer uses,
 * at the printer's resolution. Null while loading, or when the image uses the old path.
 * The editor view turns the element itself, so the tile is built unrotated.
 */
export type ModedTileView = { tile: PlacedTile; boxWidthDots: number; boxHeightDots: number };

export function useModedTile(element: ImageEl | undefined, uri: string | undefined): ModedTileView | null {
  const settings = element ? modedImageSettings(element) : null;
  const active = element && settings && usesModedPrint(element) && uri;
  const key = active
    ? [
        uri,
        element!.width,
        element!.height,
        element!.flipH ? 1 : 0,
        element!.flipV ? 1 : 0,
        element!.contentFit ?? 'contain',
        imageSettingsKey(settings!),
        element!.antiColor ? 1 : 0,
      ].join('|')
    : '';
  const [tile, setTile] = useState<ModedTileView | null>(null);

  useEffect(() => {
    if (!active) {
      setTile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const src = await loadImageSource(uri!);
      if (cancelled || !src) return;
      const dpi = previewDpi();
      const box = imageBoxDots(element!, dpi);
      setTile({
        tile: buildImageTile(element!, src, dpi, { rotation: 0 }),
        boxWidthDots: box.w,
        boxHeightDots: box.h,
      });
    })();
    return () => {
      cancelled = true;
    };
    // `key` carries every input that changes the dots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active ? tile : null;
}
