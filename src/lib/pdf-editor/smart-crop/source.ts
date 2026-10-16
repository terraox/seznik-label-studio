/**
 * Smart Crop — where the analysis buffer comes from (plan §2.5).
 *
 * The existing `pdf-raster` module at its own 100 DPI cache key, decoded with
 * the existing `pngBase64ToGray`. No new dependency, no native change, and the
 * 150 / 225 / 300 DPI preview cache entries are never disturbed.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { rasterPdfPageCached } from '@/lib/pdf-editor/raster';
import { pngBase64ToGray } from '@/lib/printer/escpos';

import { toAnalysisGray } from './gray';
import { DEFAULT_DETECT_OPTIONS } from './params';
import type { GrayPage, NormRect } from './types';

export const SMART_CROP_DPI = 100;

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export type LoadedAnalysisPage = {
  gray: GrayPage;
  renderMs: number;
  decodeMs: number;
  downscaleMs: number;
};

/** Render → read → decode → downscale, timed. Throws on render or decode failure. */
/** The part of a decoded page inside `region` (fractions of that page). */
function cropGray(page: GrayPage, region: NormRect): GrayPage {
  const x0 = Math.max(0, Math.min(page.width - 1, Math.round(region.x * page.width)));
  const y0 = Math.max(0, Math.min(page.height - 1, Math.round(region.y * page.height)));
  const w = Math.max(1, Math.min(page.width - x0, Math.round(region.w * page.width)));
  const h = Math.max(1, Math.min(page.height - y0, Math.round(region.h * page.height)));
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const from = (y0 + y) * page.width + x0;
    gray.set(page.gray.subarray(from, from + w), y * w);
  }
  return { width: w, height: h, gray };
}

/**
 * Render → read → decode → downscale, timed. Throws on render or decode failure.
 * With `region`, only that part of the page is analysed and treated as the whole page.
 */
export async function loadAnalysisGray(
  sourceUri: string,
  pageIndex: number,
  region?: NormRect | null,
): Promise<LoadedAnalysisPage> {
  const t0 = now();
  const rendered = await rasterPdfPageCached(sourceUri, pageIndex, SMART_CROP_DPI);
  const t1 = now();
  const b64 = await FileSystem.readAsStringAsync(rendered.uri, { encoding: FileSystem.EncodingType.Base64 });
  const full = pngBase64ToGray(b64);
  const decoded = region ? cropGray(full, region) : full;
  const t2 = now();
  const gray = toAnalysisGray(decoded, DEFAULT_DETECT_OPTIONS.analysisLongEdge);
  const t3 = now();
  return { gray, renderMs: t1 - t0, decodeMs: t2 - t1, downscaleMs: t3 - t2 };
}
