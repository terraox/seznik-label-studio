/**
 * Ecommerce shipping labels — read a PDF, find the label on every page, print the result.
 *
 * Detection reuses Smart Crop at its own 100 DPI render. Printing reuses the PDF editor's
 * print path one crop at a time, so the printer bridge and quality settings are unchanged.
 */

import { buildTemplate, locateFromProfile, type PageTemplate } from '@/lib/ecommerce-label/profile';
import { trimBottomToRule } from '@/lib/ecommerce-label/trim';
import { loadAnalysisGray } from '@/lib/pdf-editor/smart-crop/source';
import { detectSections } from '@/lib/pdf-editor/smart-crop/detector';
import { leaves, type NormRect } from '@/lib/pdf-editor/smart-crop/types';
import {
  locateInvoicePage,
  locatePage,
  platformName,
  type LocatedPage,
  type PlatformId,
} from '@/lib/ecommerce-label/platforms';
import { isPdfRowScanAvailable, scanPdfRows } from 'pdf-raster';
import { base64ToBytes } from '@/lib/printer/escpos';
import { prewarmPrintPages, printEditedPdf, type PdfPrintOptions } from '@/lib/pdf-editor/print';
import type { OutputSize, PdfEditSession } from '@/lib/pdf-editor/session';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';

export type ScannedPage = {
  pageIndex: number;
  /** Amazon's two-page format keeps the invoice on the page after the label. */
  invoicePage?: { pageIndex: number; rect: NormRect };
} & LocatedPage;

export type ScanResult = {
  pages: ScannedPage[];
  /** Zero-based pages that do not look like this platform's label. */
  skipped: number[];
};

export class WrongPlatformError extends Error {
  constructor(platform: PlatformId) {
    super(`This does not look like a ${platformName(platform)} shipping label PDF.`);
    this.name = 'WrongPlatformError';
  }
}

async function analyzePage(uri: string, pageIndex: number) {
  const { gray } = await loadAnalysisGray(uri, pageIndex);
  return { gray, leaves: leaves(detectSections(gray)) };
}

function labelFrom(
  platform: PlatformId,
  pageIndex: number,
  page: Awaited<ReturnType<typeof analyzePage>>,
): ScannedPage | null {
  const found = locatePage(platform, page.leaves);
  if (!found) return null;
  // Flipkart prints a dashed cut line right under the label box; the detector includes it.
  const label = platform === 'flipkart' ? trimBottomToRule(page.gray, found.label) : found.label;
  return { pageIndex, ...found, label };
}

/** Pages profiled per native call; progress is reported between calls. */
const CHUNK = 50;
/** Profiles are drawn at screen resolution: enough to read rules, far cheaper than 100 DPI. */
const PROFILE_DPI = 72;

/**
 * Finds the label on every page. The first page is analysed in full and decides whether the file
 * is accepted at all, so a wrong PDF is rejected before the rest is read. The other pages are
 * read as row profiles on several native threads and placed from the first page's template; a
 * page the profile cannot place is checked in full, and one that still does not match is skipped.
 */
export async function scanLabelPdf(
  uri: string,
  pageCount: number,
  platform: PlatformId,
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
  /** Labels found so far, after the first page and after every chunk, so a preview can open early. */
  onPartial?: (pages: ScannedPage[]) => void,
): Promise<ScanResult> {
  const started = Date.now();
  const firstPage = await analyzePage(uri, 0);
  const first = labelFrom(platform, 0, firstPage);
  if (!first) throw new WrongPlatformError(platform);
  onProgress?.(1, pageCount);
  const placed = new Map<number, ScannedPage>([[0, first]]);
  const partial = () => onPartial?.([...placed.values()].sort((x, y) => x.pageIndex - y.pageIndex));
  partial();
  if (__DEV__) console.info(`[SHIP-SCAN] first page ${Date.now() - started} ms, ${pageCount} pages`);
  if (pageCount === 1) return { pages: [first], skipped: [] };

  // Amazon's two-page format: each label page is followed by its invoice page.
  const twoPage = platform === 'amazon' && first.invoice === null;
  let invoiceRect: NormRect | null = null;
  const consumed = new Set<number>();
  const attachInvoice = (pageIndex: number, rect: NormRect): boolean => {
    const label = placed.get(pageIndex - 1);
    if (!label || label.invoice || label.invoicePage) return false;
    label.invoicePage = { pageIndex, rect };
    consumed.add(pageIndex);
    return true;
  };
  if (twoPage) {
    const secondPage = await analyzePage(uri, 1);
    const second = labelFrom(platform, 1, secondPage);
    if (second) placed.set(1, second);
    else {
      invoiceRect = locateInvoicePage(platform, secondPage.leaves);
      if (invoiceRect) attachInvoice(1, invoiceRect);
    }
  }

  const unsure: number[] = [];
  const fast = isPdfRowScanAvailable();
  if (!fast && pageCount > 3) {
    // Every page is then read in full, one by one: this is the slow path. A rebuilt dev client has the fast scanner.
    console.warn('[SHIP-SCAN] native row scanner missing in this build: scanning page by page (slow). Rebuild the app.');
  }
  if (fast) {
    try {
      let template: PageTemplate | null = null;
      for (let start = 0; start < pageCount; start += CHUNK) {
        if (isCancelled?.()) break;
        const end = Math.min(pageCount, start + CHUNK);
        const scan = await scanPdfRows(uri, start, end, {
          dpi: PROFILE_DPI,
          x0: first.label.x,
          x1: first.label.x + first.label.w,
        });
        const bytes = base64ToBytes(scan.data);
        for (let n = 0; n < scan.count; n++) {
          const pageIndex = scan.start + n;
          const profile = bytes.subarray(n * scan.heightPx, (n + 1) * scan.heightPx);
          if (pageIndex === 0) {
            template = buildTemplate(platform, first, profile);
            continue;
          }
          if (placed.has(pageIndex) || consumed.has(pageIndex)) continue;
          const found = template ? locateFromProfile(template, profile) : null;
          if (found) {
            placed.set(pageIndex, { pageIndex, ...found });
          } else if (invoiceRect && meanPercent(profile) >= 3 && attachInvoice(pageIndex, invoiceRect)) {
            // An invoice page: not a label, and it follows one.
          } else {
            unsure.push(pageIndex);
          }
        }
        onProgress?.(end, pageCount);
        partial();
      }
    } catch {
      // The native call failed part-way: read every page not yet placed in full.
      unsure.length = 0;
      for (let i = 1; i < pageCount; i++) if (!placed.has(i) && !consumed.has(i)) unsure.push(i);
    }
  } else {
    for (let i = 1; i < pageCount; i++) if (!placed.has(i) && !consumed.has(i)) unsure.push(i);
  }

  // Pages the profile could not place are read in full, a few at a time (the render runs natively, so
  // reads overlap). They are then applied in page order, because an invoice attaches to the page before it.
  const skipped: number[] = [];
  type Checked = { label: ScannedPage | null; invoice: NormRect | null };
  const checkedPages = new Map<number, Checked>();
  let checked = 0;
  let nextUnsure = 0;
  const worker = async () => {
    while (nextUnsure < unsure.length) {
      if (isCancelled?.()) return;
      const pageIndex = unsure[nextUnsure++];
      const page = await analyzePage(uri, pageIndex).catch(() => null);
      const label = page ? labelFrom(platform, pageIndex, page) : null;
      const invoice = page && !label && twoPage ? locateInvoicePage(platform, page.leaves) : null;
      checkedPages.set(pageIndex, { label, invoice });
      onProgress?.(pageCount - unsure.length + ++checked, pageCount);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  for (const pageIndex of [...unsure].sort((a, b) => a - b)) {
    const result = checkedPages.get(pageIndex);
    if (!result) continue;
    if (result.label) placed.set(pageIndex, result.label);
    else if (!(result.invoice && attachInvoice(pageIndex, result.invoice))) skipped.push(pageIndex);
  }
  if (__DEV__) console.info(`[SHIP-SCAN] done ${Date.now() - started} ms, ${placed.size} labels, ${unsure.length} re-checked`);
  const pages = [...placed.values()].sort((x, y) => x.pageIndex - y.pageIndex);
  return { pages, skipped };
}

function meanPercent(profile: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < profile.length; i++) sum += profile[i];
  return sum / Math.max(1, profile.length);
}

type PrintItem = { pageIndex: number; rect: NormRect };

/** Label first, then (if kept) its invoice, page by page. */
export function printItems(pages: ScannedPage[], keepInvoice: boolean): PrintItem[] {
  return pages.flatMap((p) => {
    const invoice = p.invoicePage ?? (p.invoice ? { pageIndex: p.pageIndex, rect: p.invoice } : null);
    return [
      { pageIndex: p.pageIndex, rect: p.label },
      ...(keepInvoice && invoice ? [{ pageIndex: invoice.pageIndex, rect: invoice.rect }] : []),
    ];
  });
}

export async function printLabelPages(args: {
  uri: string;
  name: string;
  pageCount: number;
  pageSizesPt: { w: number; h: number }[];
  outputSize: OutputSize;
  items: PrintItem[];
  options?: Partial<PdfPrintOptions>;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ printed: number }> {
  const { items } = args;
  const sessionFor = (item: PrintItem): PdfEditSession => {
    const rotationByPage = Array.from({ length: args.pageCount }, () => 0);
    return {
      sourceUri: args.uri,
      sourceName: args.name,
      pageCount: args.pageCount,
      pageSizesPt: args.pageSizesPt,
      currentPageIndex: item.pageIndex,
      outputSize: args.outputSize,
      crop: {
        scope: { mode: 'this' },
        originNorm: { x: item.rect.x, y: item.rect.y },
        sizeNorm: { w: item.rect.w, h: item.rect.h },
      },
      rotationByPage,
      sharpnessByPage: Array.from({ length: args.pageCount }, () => 0),
      watermark: null,
      colorMode: 'Original',
    };
  };

  const copies = Math.max(1, Math.round(args.options?.copies ?? 1));
  let printed = 0;
  for (let n = 0; n < items.length; n++) {
    if (n + 1 < items.length) prewarmPrintPages(sessionFor(items[n + 1]), [items[n + 1].pageIndex]);
    await printEditedPdf(sessionFor(items[n]), [items[n].pageIndex], { ...args.options, copies, recordHistory: false });
    printed++;
    args.onProgress?.(printed, items.length);
  }

  if (useSettingsStore.getState().printing.recordHistory) {
    usePrinterStore.getState().addHistoryEntry({
      labelName: `${args.name} (${printed} labels)`,
      copies,
      source: 'pdf',
    });
  }
  return { printed };
}
