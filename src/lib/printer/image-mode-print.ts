/**
 * Print one finished picture (a photo, or a PDF page) with an image print mode.
 *
 * The dots are decided once, at the label's dot size (image-mode-document.ts), then the picture goes
 * through the same headless raster and send that normal labels use. Every bridge gets the same modes:
 * TD-404 and Josh send the finished 1-bit bytes, the rest send them as a pure black/white PNG, which
 * their own threshold or dither step leaves unchanged.
 */
import { buildModedPictureDocument, type ModedGrayPrintInput } from '@/lib/printer/image-mode-document';
import { printLabelDocumentMainPipeline } from '@/lib/printer/main-pipeline-print';
import { joshEffectiveDpi } from '@/lib/printer/josh-print';
import { getPrinterManager } from '@/lib/printer/printer-manager';

import { usePrinterStore } from '@/stores/printer-store';

export type { ModedGrayPrintInput };

/**
 * Josh does not dither correctly, so the dither modes are off for it. A connected printer decides;
 * with none connected the printer chosen at purchase (or last connected) decides.
 */
export function bridgeSupportsImageModes(): boolean {
  const { status, selectedPrinterModel } = usePrinterStore.getState();
  const connected = status === 'connected' || status === 'printing';
  if (connected) return !getPrinterManager().isJosh;
  return selectedPrinterModel !== 'josh';
}

/** Same rule as `bridgeSupportsImageModes`, re-evaluated when the printer changes. */
export function useImageModesSupported(): boolean {
  usePrinterStore((s) => s.status + s.selectedPrinterModel + (s.sdkId ?? '') + (s.transport ?? ''));
  return bridgeSupportsImageModes();
}

/** The printer dpi the headless raster uses for this job. */
export function modedJobDpi(): number {
  const manager = getPrinterManager();
  const raw = manager.getPrintDpi();
  return manager.isJosh ? joshEffectiveDpi(raw) : raw;
}

export async function printGrayWithImageMode(input: ModedGrayPrintInput): Promise<void> {
  if (!bridgeSupportsImageModes()) {
    throw new Error('Image print modes are not available.');
  }
  const doc = buildModedPictureDocument(input, modedJobDpi());
  await printLabelDocumentMainPipeline(doc, {
    gapMm: input.gapMm,
    copies: input.copies,
    darkness: input.darkness,
    speed: input.speed,
    offsetExtraMm: input.offsetMm,
  });
}
