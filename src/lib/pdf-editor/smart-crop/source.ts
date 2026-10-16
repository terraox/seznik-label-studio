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
import type { GrayPage } from './types';

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
export async function loadAnalysisGray(sourceUri: string, pageIndex: number): Promise<LoadedAnalysisPage> {
  const t0 = now();
  const rendered = await rasterPdfPageCached(sourceUri, pageIndex, SMART_CROP_DPI);
  const t1 = now();
  const b64 = await FileSystem.readAsStringAsync(rendered.uri, { encoding: FileSystem.EncodingType.Base64 });
  const decoded = pngBase64ToGray(b64);
  const t2 = now();
  const gray = toAnalysisGray(decoded, DEFAULT_DETECT_OPTIONS.analysisLongEdge);
  const t3 = now();
  return { gray, renderMs: t1 - t0, decodeMs: t2 - t1, downscaleMs: t3 - t2 };
}
