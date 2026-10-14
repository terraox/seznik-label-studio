import { defaultLabelSettings } from '@/lib/label-settings';
import { renderEditedPdfPages } from '@/lib/pdf-editor/export';
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
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { printArtworkJob } from '@/lib/printer/universal-bridge';
import { usePrinterStore } from '@/stores/printer-store';
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

/**
 * Print edited PDF pages through the connected printer's native bridge
 * (`printArtworkJob`). JS TSPL/ESC encode runs only if that bridge is missing.
 */
export async function printEditedPdf(
  session: PdfEditSession,
  pageIndices: number[],
  options?: {
    copies?: number;
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
    darkness: label.printDarkness,
    speed: label.printSpeed,
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
  const mediaType = paper === 'Receipt' ? 'continuous' : paper === 'Black mark' ? 'bline' : 'gap';
  const copies = Math.max(1, Math.round(options?.copies ?? 1));
  const dpi = manager.getPrintDpi();

  const pages = await renderEditedPdfPages(session, pageIndices, dpi, options?.onProgress);

  let pagesPrinted = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    options?.onProgress?.(i + 1, pages.length);
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
      await printArtworkJob({
        widthMm,
        heightMm,
        gray,
        dither: pageDither,
        threshold: quality.threshold,
        alreadyBinarized,
        copies,
        gapMm: label.gapLengthMm,
        mediaType,
        density: quality.density,
        speed: quality.speed,
        offsetXmm: label.hOffsetMm,
        offsetYmm: label.vOffsetMm,
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
        hOffsetMm: label.hOffsetMm,
        dpi,
      });
      const bytes = encodeConnectedPrinterJob(bits, {
        widthMm,
        heightMm,
        gapMm: label.gapLengthMm,
        copies: 1,
        density: quality.density,
        speed: quality.speed,
        vOffsetMm: label.vOffsetMm,
        hOffsetMm: label.hOffsetMm,
        media: mediaType,
        dpi,
      });
      await sendIsolatedPrintCopies(bytes, copies);
    }
    pagesPrinted++;
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
