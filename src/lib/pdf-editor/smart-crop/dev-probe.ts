/**
 * Smart Crop — dev-only probe (Phase 1 exit criterion).
 *
 * Runs the real pipeline on the page the editor is showing and logs the boxes
 * plus the time split, so the numbers in the plan are measured on a device
 * rather than guessed. No UI, no session changes, never shipped: every entry
 * point is behind `__DEV__`.
 *
 * It also writes the exact 100-DPI grayscale buffer the detector saw to a PNG
 * and logs the path. That file is how the redacted `fixtures/smart-crop/*.png`
 * fixtures are produced — there is no node-side PDF renderer in this project
 * (plan R2.7).
 */

import * as FileSystem from 'expo-file-system/legacy';

import { encodePng } from '@/lib/fast-png-shim';
import { bytesToBase64 } from '@/lib/printer/escpos';

import { detectSections } from './detector';
import { loadAnalysisGray, SMART_CROP_DPI } from './source';
import type { DetectResult, GrayPage } from './types';

export { SMART_CROP_DPI };

const TAG = '[smart-crop]';

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function ms(value: number): string {
  return `${value.toFixed(1)}ms`;
}

export type ProbeResult = {
  pageIndex: number;
  renderMs: number;
  decodeMs: number;
  downscaleMs: number;
  detectMs: number;
  totalMs: number;
  result: DetectResult;
  fixturePath: string | null;
};

/** Write the analysis buffer as a grayscale PNG so it can become a fixture. */
async function writeFixturePng(page: GrayPage, pageIndex: number): Promise<string | null> {
  try {
    const bytes = encodePng({
      width: page.width,
      height: page.height,
      data: page.gray,
      depth: 8,
      channels: 1,
    });
    const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!root) return null;
    const dir = `${root}smart-crop/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const path = `${dir}page-${pageIndex + 1}-${SMART_CROP_DPI}dpi-gray.png`;
    await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return path;
  } catch {
    return null;
  }
}

/**
 * Render → decode → downscale → detect, with a timing for each step.
 * Throws on a render or decode failure; the caller logs and moves on.
 */
export async function probeSmartCrop(
  sourceUri: string,
  pageIndex: number,
  options?: { writeFixture?: boolean },
): Promise<ProbeResult> {
  const loaded = await loadAnalysisGray(sourceUri, pageIndex);

  // The buffer is already downscaled, so the detector's own downscale is a
  // no-op and the split below is not double counted.
  const t0 = now();
  const result = detectSections(loaded.gray);
  const detectMs = now() - t0;

  const fixturePath = options?.writeFixture ? await writeFixturePng(loaded.gray, pageIndex) : null;

  return {
    pageIndex,
    renderMs: loaded.renderMs,
    decodeMs: loaded.decodeMs,
    downscaleMs: loaded.downscaleMs,
    detectMs,
    totalMs: loaded.renderMs + loaded.decodeMs + loaded.downscaleMs + detectMs,
    result,
    fixturePath,
  };
}

/** `probeSmartCrop` plus the console report. Swallows every error. */
export async function logSmartCropProbe(
  sourceUri: string,
  pageIndex: number,
  options?: { writeFixture?: boolean },
): Promise<void> {
  try {
    const p = await probeSmartCrop(sourceUri, pageIndex, options);
    const r = p.result;
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

    console.log(
      `${TAG} page ${pageIndex + 1} · ${SMART_CROP_DPI} DPI · analysis ${r.analysis.w}×${r.analysis.h}` +
        ` · ink<${r.tone.inkMax} paper=${r.tone.paperLevel}`,
    );
    console.log(
      `${TAG} time: render ${ms(p.renderMs)} · decode ${ms(p.decodeMs)} · downscale ${ms(p.downscaleMs)}` +
        ` · detect ${ms(p.detectMs)} (prepare ${ms(r.timing.prepareMs)}, cut ${ms(r.timing.cutMs)})` +
        ` · total ${ms(p.totalMs)}`,
    );
    console.log(
      `${TAG} content ${pct(r.contentRect.x)},${pct(r.contentRect.y)} ${pct(r.contentRect.w)}×${pct(r.contentRect.h)}`,
    );

    const leafList = r.sections.filter((s) => s.kind === 'leaf');
    console.log(`${TAG} ${leafList.length} sections, ${r.visibleIds.length} visible:`);
    for (const s of leafList) {
      const flags = [
        r.visibleIds.includes(s.id) ? 'visible' : 'hidden',
        s.hasCodeLike ? 'code' : null,
        s.id === r.suggestedId ? 'SUGGESTED' : null,
      ]
        .filter(Boolean)
        .join(' ');
      console.log(
        `${TAG}   #${s.order} ${s.id} ${pct(s.rect.x)},${pct(s.rect.y)} ${pct(s.rect.w)}×${pct(s.rect.h)}` +
          ` conf ${s.confidence} ink ${pct(s.inkRatio)} [${s.boundedBy.top}|${s.boundedBy.right}|${s.boundedBy.bottom}|${s.boundedBy.left}] ${flags}`,
      );
    }
    for (const d of r.dropped) {
      console.log(
        `${TAG}   dropped ${d.reason} ${pct(d.rect.x)},${pct(d.rect.y)} ${pct(d.rect.w)}×${pct(d.rect.h)}`,
      );
    }
    if (p.fixturePath) console.log(`${TAG} fixture PNG: ${p.fixturePath}`);
  } catch (err) {
    console.log(`${TAG} probe failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
