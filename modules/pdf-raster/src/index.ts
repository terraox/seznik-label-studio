import { requireNativeModule } from 'expo-modules-core';

export type RasteredPdfPage = {
  uri: string;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
  pageCount: number;
};

export type PdfRowScan = {
  pageCount: number;
  /** First page in this scan, and how many pages it holds. */
  start: number;
  count: number;
  heightPx: number;
  widthPx: number;
  /** Base64 bytes: `count` profiles of `heightPx` entries, each the ink percent of one pixel row. */
  data: string;
};

type NativePdfRaster = {
  renderPdfPage(uriString: string, pageIndex: number, dpi: number): Promise<RasteredPdfPage>;
  scanPdfRows?(
    uriString: string,
    startPage: number,
    endPage: number,
    dpi: number,
    x0: number,
    x1: number,
    threads: number,
  ): Promise<PdfRowScan>;
};

let cached: NativePdfRaster | null | undefined;

function getNative(): NativePdfRaster | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativePdfRaster>('PdfRaster');
  } catch {
    cached = null;
  }
  return cached;
}

export async function renderPdfPage(
  uriString: string,
  pageIndex: number,
  dpi = 150,
): Promise<RasteredPdfPage> {
  const mod = getNative();
  if (!mod) {
    throw new Error(
      'PDF raster module is not available. Rebuild the development client after adding pdf-raster.',
    );
  }
  return mod.renderPdfPage(uriString, pageIndex, dpi);
}

export function isPdfRasterAvailable(): boolean {
  return getNative() != null;
}

/** True when the installed native build can profile pages in bulk (needs a rebuilt dev client). */
export function isPdfRowScanAvailable(): boolean {
  return typeof getNative()?.scanPdfRows === 'function';
}

/**
 * Row ink profiles for pages `startPage` up to `endPage` (exclusive): for each pixel row, the percent
 * of dark pixels between `x0` and `x1` (fractions of the page width). Pages are drawn on several
 * threads and only the profiles come back.
 */
export async function scanPdfRows(
  uriString: string,
  startPage: number,
  endPage: number,
  options: { dpi?: number; x0?: number; x1?: number; threads?: number } = {},
): Promise<PdfRowScan> {
  const mod = getNative();
  if (!mod?.scanPdfRows) {
    throw new Error('PDF row scan is not available. Rebuild the development client.');
  }
  return mod.scanPdfRows(
    uriString,
    startPage,
    endPage,
    options.dpi ?? 72,
    options.x0 ?? 0,
    options.x1 ?? 1,
    options.threads ?? 4,
  );
}
