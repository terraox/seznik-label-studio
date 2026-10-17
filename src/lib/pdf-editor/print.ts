import { defaultLabelSettings } from '@/lib/label-settings';
import { renderEditedPdfPages } from '@/lib/pdf-editor/export';
import { pageNeedsComposer, renderLabelPageGray, type LabelPageRaster } from '@/lib/pdf-editor/render-label';
import { pageColorMode, type PdfEditSession } from '@/lib/pdf-editor/session';
import {
  qualityCapsFor,
  resolveQualityBridge,
  type BridgeId,
} from '@/lib/printer/bridge-quality-caps';
import { binarizeGrayForPrint, downsampleGrayToSize, grayToPngBase64 } from '@/lib/printer/escpos';
import { mmToDots, tsplPackedWidthDots } from '@/lib/printer/print-spec';
import {
  encodeConnectedPrinterJob,
  rasterizePngForPrint,
  sendIsolatedPrintCopies,
} from '@/lib/printer/print-job';
import { resolvePrintQuality } from '@/lib/printer/print-quality';
import {
  formatPaperTypeSetting,
  paperPrinterId,
  paperTypeCommand,
} from '@/lib/printer/paper-type';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { sendArtworkJob } from '@/lib/printer/universal-bridge';
import { usePrinterStore } from '@/stores/printer-store';
import { usePrintStatsStore } from '@/stores/print-stats-store';
import { useSettingsStore } from '@/stores/settings-store';

function asBridgeId(value: string | null | undefined): BridgeId | null {
  switch (value) {
    case 'td404-spp':
    case 'ble':
    case 'wifi':
    case 'josh-lpapi':
    case 'tez-spp':
    case 'dev-spp':
    case 'labelx-spp':
      return value;
    default:
      return null;
  }
}

function nativeBridgeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /NATIVE_PNG_UNAVAILABLE|not available|unavailable|development build|rebuild/i.test(message);
}

const PRINT_RASTER_CACHE_MAX = 8;
const printRasterCache = new Map<string, Promise<LabelPageRaster[]>>();

/** Everything that changes the rendered raster of one page. */
function printRasterKey(session: PdfEditSession, pageIndex: number, dpi: number): string {
  return JSON.stringify([
    session.sourceUri,
    pageIndex,
    dpi,
    session.outputSize.widthMm,
    session.outputSize.heightMm,
    session.pageSizesPt[pageIndex] ?? null,
    session.crop ?? null,
    session.watermark ?? null,
    session.rotationByPage[pageIndex] ?? 0,
    session.sharpnessByPage[pageIndex] ?? 0,
    pageColorMode(session, pageIndex),
    session.currentPageIndex,
  ]);
}

async function renderPageUncached(
  session: PdfEditSession,
  pageIndex: number,
  dpi: number,
): Promise<LabelPageRaster[]> {
  if (!pageNeedsComposer(session, pageIndex)) {
    try {
      return [await renderLabelPageGray(session, pageIndex, dpi)];
    } catch (error) {
      console.warn('[pdf-print] native label render failed, using PDF composer', error);
    }
  }
  // Watermarked pages (or a failed native render) go through the slower PDF composer.
  return renderEditedPdfPages(session, [pageIndex], dpi);
}

/** Render a page for printing, reusing a render that was started ahead of the Print tap. */
function renderPageForPrint(
  session: PdfEditSession,
  pageIndex: number,
  dpi: number,
): Promise<LabelPageRaster[]> {
  const key = printRasterKey(session, pageIndex, dpi);
  const hit = printRasterCache.get(key);
  if (hit) return hit;
  const job = renderPageUncached(session, pageIndex, dpi);
  job.catch(() => printRasterCache.delete(key));
  printRasterCache.set(key, job);
  while (printRasterCache.size > PRINT_RASTER_CACHE_MAX) {
    const oldest = printRasterCache.keys().next().value;
    if (oldest === undefined) break;
    printRasterCache.delete(oldest);
  }
  return job;
}

/**
 * Start rendering pages for print while the user is still choosing options, so the Print tap
 * only has to send. Errors are ignored here; the real print render reports them.
 */
export function prewarmPrintPages(session: PdfEditSession, pageIndices: number[]): void {
  let dpi: number;
  try {
    dpi = getPrinterManager().getPrintDpi();
  } catch {
    return;
  }
  const unique = pageIndices.filter((n, i, all) => n >= 0 && n < session.pageCount && all.indexOf(n) === i);
  void unique.reduce<Promise<unknown>>(
    (chain, pageIndex) => chain.then(() => renderPageForPrint(session, pageIndex, dpi)).catch(() => {}),
    Promise.resolve(),
  );
}

export function clearPrintRasterCache(): void {
  printRasterCache.clear();
}

/**
 * Print edited PDF pages through the connected printer's native bridge
 * (`printArtworkJob`). JS TSPL/ESC encode runs only if that bridge is missing.
 */
export type PdfPrintOptions = {
  copies: number;
  /** null = Auto. */
  darkness: number | null;
  speed: number | null;
  gapMm: number;
  /** Total offsets: printer calibration plus label offset. */
  hOffsetMm: number;
  vOffsetMm: number;
};

export async function printEditedPdf(
  session: PdfEditSession,
  pageIndices: number[],
  options?: Partial<PdfPrintOptions> & {
    onProgress?: (current: number, total: number) => void;
  },
): Promise<{ pagesPrinted: number }> {
  const manager = getPrinterManager();
  if (!manager.isConnected) {
    throw new Error('Printer Not Connected. Please connect your printer before printing.');
  }
  if (pageIndices.length === 0) {
    throw new Error('No pages match this selection.');
  }

  const label = defaultLabelSettings();
  const settings = useSettingsStore.getState();
  const printer = usePrinterStore.getState();
  const colorMode = pageColorMode(session, session.currentPageIndex);
  const quality = resolvePrintQuality({
    darkness: options && 'darkness' in options ? (options.darkness ?? null) : label.printDarkness,
    speed: options && 'speed' in options ? (options.speed ?? null) : label.printSpeed,
    grayThreshold: settings.defaults.grayThreshold,
    colorMode,
    caps: qualityCapsFor(
      resolveQualityBridge({
        activeTransport: asBridgeId(manager.transport),
        storeTransport: printer.transport,
        sdkId: printer.sdkId,
      }),
    ),
  });
  const paper = settings.defaults.paperType;
  const copies = Math.max(1, Math.round(options?.copies ?? 1));
  const dpi = manager.getPrintDpi();
  const gapMm = options?.gapMm ?? label.gapLengthMm;
  const paperCommand = paperTypeCommand({
    printer: paperPrinterId({ isJosh: manager.isJosh, isDev: manager.isDev }),
    paperType: paper,
    gapMm,
  });
  const mediaType = paperCommand.media;
  console.info(`[PAPER-TYPE] ${paperCommand.printer} ${paper} ${formatPaperTypeSetting(paperCommand)}`);
  const hOffsetMm = options?.hOffsetMm ?? label.hOffsetMm;
  const vOffsetMm = options?.vOffsetMm ?? label.vOffsetMm;

  const renderOne = (pageIndex: number) => renderPageForPrint(session, pageIndex, dpi);

  // Render the next page while the current one is being sent, so the printer is not left
  // waiting for every page to render first. Only two pages are in memory at a time.
  let pagesPrinted = 0;
  let pending = renderOne(pageIndices[0]);
  for (let n = 0; n < pageIndices.length; n++) {
    const rendered = await pending;
    pending = n + 1 < pageIndices.length ? renderOne(pageIndices[n + 1]) : Promise.resolve([]);
    // A failed send below must not leave this render as an unhandled rejection.
    pending.catch(() => {});
    for (const page of rendered) {
      options?.onProgress?.(n + 1, pageIndices.length);
      const pageMode = pageColorMode(session, page.pageIndex);
      const pageDither = pageMode === 'Halftone';
      const alreadyBinarized = pageMode === 'B & W';
      const widthMm = session.outputSize.widthMm;
      const heightMm = session.outputSize.heightMm;
      const dotsW = mmToDots(widthMm, dpi);
      const dotsH = mmToDots(heightMm, dpi);
      // TD-404 refuses any bitmap that is not the packed head size. PDF points
      // round first (50 mm → 141 pt → 595 px), so resample onto that size here.
      const targetW = manager.usesTd404CommandSet ? tsplPackedWidthDots(dotsW) : dotsW;
      const fitted = downsampleGrayToSize(page.gray, targetW, dotsH);
      const gray = alreadyBinarized
        ? binarizeGrayForPrint(fitted, {
            threshold: quality.threshold,
            dither: false,
            stretchContrast: true,
          })
        : fitted;

      try {
        await sendArtworkJob({
          widthMm,
          heightMm,
          gray,
          dither: pageDither,
          threshold: quality.threshold,
          alreadyBinarized,
          copies,
          gapMm: paperCommand.gapMm,
          mediaType,
          density: quality.density,
          speed: quality.speed,
          offsetXmm: hOffsetMm,
          offsetYmm: vOffsetMm,
        });
      } catch (error) {
        if (!nativeBridgeUnavailable(error)) throw error;
        const pngBase64 = grayToPngBase64(gray);
        const bits = rasterizePngForPrint(pngBase64, {
          widthMm,
          heightMm,
          orientation: 0,
          threshold: quality.threshold,
          dither: pageDither,
          hOffsetMm,
          dpi,
        });
        const bytes = encodeConnectedPrinterJob(bits, {
          widthMm,
          heightMm,
          gapMm: paperCommand.gapMm,
          copies: 1,
          density: quality.density,
          speed: quality.speed,
          vOffsetMm,
          hOffsetMm,
          media: mediaType,
          dpi,
        });
        await sendIsolatedPrintCopies(bytes, copies);
      }
      pagesPrinted++;
      usePrintStatsStore.getState().record(copies);
    }
  }

  if (settings.printing.recordHistory) {
    usePrinterStore.getState().addHistoryEntry({
      labelName: session.sourceName || `PDF Document (${pagesPrinted}p)`,
      copies,
      source: 'pdf',
    });
  }

  return { pagesPrinted };
}
