import { renderPdfPage, type RasteredPdfPage } from 'pdf-raster';

export const PREVIEW_DPI = 300;
export const EXPORT_DPI = 300;

const cache = new Map<string, RasteredPdfPage>();

function key(uri: string, pageIndex: number, dpi: number) {
  return `${uri}::${pageIndex}::${dpi}`;
}

export async function rasterPdfPageCached(
  uri: string,
  pageIndex: number,
  dpi: number,
): Promise<RasteredPdfPage> {
  const k = key(uri, pageIndex, dpi);
  const hit = cache.get(k);
  if (hit) return hit;
  const page = await renderPdfPage(uri, pageIndex, dpi);
  cache.set(k, page);
  return page;
}

export function prefetchNeighborPages(uri: string, pageIndex: number, pageCount: number, dpi: number) {
  const neighbors = [pageIndex - 1, pageIndex + 1].filter((i) => i >= 0 && i < pageCount);
  for (const i of neighbors) {
    void rasterPdfPageCached(uri, i, dpi).catch(() => {});
  }
}

const regionCache = new Map<string, Promise<string>>();

/** The part of a rendered page inside `rect` (page fractions) as its own PNG, cached so re-cropping opens at once. */
export function regionImageCached(
  pageUri: string,
  rect: { x: number; y: number; w: number; h: number },
): Promise<string> {
  const key = `${pageUri}|${rect.x.toFixed(5)},${rect.y.toFixed(5)},${rect.w.toFixed(5)},${rect.h.toFixed(5)}`;
  const hit = regionCache.get(key);
  if (hit) return hit;
  const job = import('@/lib/editor/apply-image-crop')
    .then((m) => m.applyImageCrop(pageUri, 1, 1, rect, { format: 'png' }))
    .then((out) => out.uri);
  job.catch(() => regionCache.delete(key));
  regionCache.set(key, job);
  return job;
}

export function clearRasterCache() {
  cache.clear();
  regionCache.clear();
}

export type { RasteredPdfPage };
