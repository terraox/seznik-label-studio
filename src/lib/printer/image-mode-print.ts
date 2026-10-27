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

export type { ModedGrayPrintInput };

export function bridgeSupportsImageModes(): boolean {
  return true;
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
