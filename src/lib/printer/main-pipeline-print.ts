/**
 * Print a LabelDocument through the same native fast paths as the Print screen
 * (headless Skia mono / PNG), without ViewShot.
 */
import type { LabelDocument } from '@/lib/label-document';
import {
  darknessSteps,
  qualityCapsFor,
  resolveQualityBridge,
} from '@/lib/printer/bridge-quality-caps';
import { grayToPngBase64 } from '@/lib/printer/escpos';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { joshEffectiveDpi, joshHeadlessRasterOptions, joshInkOffsetMm } from '@/lib/printer/josh-print';
import { tryNativeSdkPngPrint } from '@/lib/printer/print-job';
import { resolvePrintQuality } from '@/lib/printer/print-quality';
import { mmToDots, td404EdgeBorderOptions } from '@/lib/printer/print-spec';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';
import { unpackMono1bppToGray } from '@/printing/raster/bit-packer';
import { ensurePrintTypefacesForDocument, missingPrintTypefaces } from '@/printing/raster/print-typeface';
import {
  assertHeadlessRasterDocument,
  canHeadlessRasterPrint,
  rasterizeDocumentToBitmapTimed,
  type RasterBitmap,
} from '@/printing/raster/skia-rasterizer';

export type MainPipelinePrintOptions = {
  gapMm?: number;
  copies?: number;
  /** Josh test labels: fail fast when headless raster produced no ink (caller may fall back). */
  assertInk?: boolean;
  /** Added to stored H/V calibration for this job only (e.g. Josh test strip tune). */
  offsetExtraMm?: { x?: number; y?: number };
};

export const JOSH_HEADLESS_EMPTY = 'JOSH_HEADLESS_EMPTY';

function grayHasInk(gray: Uint8Array, minDarkPixels = 48): boolean {
  let dark = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < 200) {
      dark++;
      if (dark >= minDarkPixels) return true;
    }
  }
  return false;
}

function calibrationOffsetsMm(): { x: number; y: number } {
  const store = usePrinterStore.getState();
  const key = store.deviceId ?? store.sdkId ?? 'unknown';
  const cal = store.printCalibration[key];
  return {
    x: Math.round((cal?.hOffsetMm ?? 0) * 100) / 100,
    y: Math.round((cal?.vOffsetMm ?? 0) * 100) / 100,
  };
}

function bitmapToPngBase64(bitmap: RasterBitmap, gray?: Uint8Array): string {
  const g =
    gray ??
    unpackMono1bppToGray(bitmap.mono1bppBuffer, bitmap.widthDots, bitmap.heightDots, bitmap.bytesPerRow);
  return grayToPngBase64({ width: bitmap.widthDots, height: bitmap.heightDots, gray: g });
}

async function rasterizeForPipeline(
  doc: LabelDocument,
  jobDpi: number,
  manager: ReturnType<typeof getPrinterManager>,
  printOffsetMm: { x: number; y: number },
  threshold: number,
  inkSteps: number,
): Promise<{ bitmap: RasterBitmap; gray: Uint8Array }> {
  if (!canHeadlessRasterPrint(doc)) {
    throw new Error('This label uses elements that require the Print screen capture path.');
  }
  assertHeadlessRasterDocument(doc);
  await ensurePrintTypefacesForDocument(doc);
  const missing = missingPrintTypefaces(doc);
  if (missing.length > 0) {
    console.warn('[main-pipeline] missing print faces (drawing anyway):', missing.join(', '));
  }

  if (manager.isJosh) {
    const timed = rasterizeDocumentToBitmapTimed(
      doc,
      jobDpi,
      joshHeadlessRasterOptions(jobDpi, printOffsetMm.x, printOffsetMm.y, {
        threshold,
        darknessSteps: inkSteps,
      }),
    );
    return { bitmap: timed.result, gray: timed.gray };
  }

  const bakeOffset = manager.usesTd404CommandSet;
  const timed = rasterizeDocumentToBitmapTimed(doc, jobDpi, {
    threshold,
    darknessSteps: inkSteps,
    bakeTd404Feed: bakeOffset,
    edgeBorders: bakeOffset ? td404EdgeBorderOptions(jobDpi) : undefined,
    pageWidthPack: 'floor',
    shiftDots: bakeOffset
      ? { x: mmToDots(printOffsetMm.x, jobDpi), y: mmToDots(printOffsetMm.y, jobDpi) }
      : undefined,
  });
  return { bitmap: timed.result, gray: timed.gray };
}

export async function printLabelDocumentMainPipeline(
  doc: LabelDocument,
  options: MainPipelinePrintOptions = {},
): Promise<void> {
  const manager = getPrinterManager();
  await manager.ensureConnected();

  const gapMm = options.gapMm ?? 3;
  const copies = options.copies ?? 1;
  const calibrated = calibrationOffsetsMm();
  const printOffsetMm = {
    x: calibrated.x + (options.offsetExtraMm?.x ?? 0),
    y: calibrated.y + (options.offsetExtraMm?.y ?? 0),
  };
  const printerState = usePrinterStore.getState();
  const jobBridge = resolveQualityBridge({
    activeTransport: manager.transport,
    storeTransport: printerState.transport,
    sdkId: printerState.sdkId,
  });
  const jobCaps = qualityCapsFor(jobBridge);
  const defaults = useSettingsStore.getState();
  const quality = resolvePrintQuality({
    darkness: null,
    speed: null,
    grayThreshold: defaults.grayThreshold,
    colorMode: defaults.colorMode,
    caps: jobCaps,
  });
  const { density: printDensity, threshold, speed: printSpeed, dither } = quality;
  const inkSteps = darknessSteps(null, jobCaps);
  const rawDpi = manager.getPrintDpi();
  const jobDpi = manager.isJosh ? joshEffectiveDpi(rawDpi) : rawDpi;
  const bakeOffset = manager.usesTd404CommandSet;
  const offsetH = bakeOffset ? 0 : printOffsetMm.x;
  const offsetV = bakeOffset ? 0 : printOffsetMm.y;
  const media = 'gap' as const;
  const { bitmap, gray } = await rasterizeForPipeline(
    doc,
    jobDpi,
    manager,
    printOffsetMm,
    threshold,
    inkSteps,
  );
  if (manager.isJosh && options.assertInk && !grayHasInk(gray)) {
    const err = new Error('Josh headless raster produced a blank page.');
    (err as Error & { code?: string }).code = JOSH_HEADLESS_EMPTY;
    throw err;
  }
  const pngBase64 = bitmapToPngBase64(bitmap, gray);

  if (manager.isLabelX) {
    await manager.printLabelXPngLabelFast({
      pngBase64,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      gapMm,
      copies,
      density:
        printDensity !== undefined && printDensity !== null
          ? Math.min(2, Math.max(0, Math.floor(printDensity / 5)))
          : 1,
      speed: printSpeed,
      hOffsetMm: offsetH,
      vOffsetMm: offsetV,
      media,
      threshold,
      dither,
    });
    return;
  }

  if (manager.isTez) {
    await manager.ensureTezTransport();
    await manager.printTezPngLabelFast({
      pngBase64,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      gapMm,
      copies,
      density: printDensity,
      speed: printSpeed,
      orientation: 0,
      dpi: jobDpi,
      hOffsetMm: offsetH,
      vOffsetMm: offsetV,
      media,
      threshold,
    });
    return;
  }

  if (manager.isJosh) {
    const joshBakeOffset = true;
    const joshInkRotatedMm = joshInkOffsetMm(offsetH, offsetV);
    const usedMono = await manager.printJoshMonoLabelFast({
      monoBytes: bitmap.mono1bppBuffer,
      widthDots: bitmap.widthDots,
      heightDots: bitmap.heightDots,
      bytesPerRow: bitmap.bytesPerRow,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      gapMm,
      copies,
      density: printDensity,
      speed: printSpeed,
      hOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.x,
      vOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.y,
      media,
      dpi: jobDpi,
    });
    if (usedMono) return;
    await manager.printJoshPngLabelFast({
      pngBase64,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      gapMm,
      copies,
      density: printDensity,
      speed: printSpeed,
      orientation: 0,
      dpi: jobDpi,
      hOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.x,
      vOffsetMm: joshBakeOffset ? 0 : joshInkRotatedMm.y,
      media,
      alignment: manager.getActivePrinterProfile().alignment,
    });
    return;
  }

  if (manager.isDev) {
    const used = await manager.printDevPngLabelFast({
      pngBase64,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      gapMm,
      copies,
      density: printDensity,
      speed: printSpeed,
      threshold,
      vOffsetMm: offsetV,
      hOffsetMm: offsetH,
      media,
      orientation: 0,
      dpi: jobDpi,
      dither,
    });
    if (!used) throw new Error('DEV native print failed.');
    return;
  }

  if (manager.usesTd404CommandSet) {
    const usedMono = await manager.printMonoLabelFast({
      monoBytes: bitmap.mono1bppBuffer,
      widthDots: bitmap.widthDots,
      heightDots: bitmap.heightDots,
      bytesPerRow: bitmap.bytesPerRow,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      gapMm,
      copies,
      density: printDensity,
      speed: printSpeed,
      vOffsetMm: offsetV,
      hOffsetMm: offsetH,
      media,
      dpi: jobDpi,
    });
    if (usedMono) return;
    const usedPng = await tryNativeSdkPngPrint({
      pngBase64,
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
      gapMm,
      copies,
      density: printDensity,
      speed: printSpeed,
      vOffsetMm: offsetV,
      hOffsetMm: offsetH,
      media,
      orientation: 0,
      dpi: jobDpi,
      threshold,
    });
    if (!usedPng) throw new Error('TD-404 native print failed.');
    return;
  }

  throw new Error('No native label print path for the connected printer.');
}
