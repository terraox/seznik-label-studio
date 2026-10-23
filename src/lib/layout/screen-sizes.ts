/**
 * Window-size math shared by screens. Pure (no react-native) so node:test can pin it across phone
 * widths, see __tests__/screen-sizes.test.ts. Each function returns exactly what its screen used
 * to compute inline.
 */

/** Widest the app content gets (tablets, web). */
export const MaxContentWidth = 800;

/** Shop: two roll / printer cards per row. */
export const ShopGrid = { pad: 16, gap: 12 } as const;

export function shopListWidth(windowWidth: number) {
  return Math.min(windowWidth, MaxContentWidth);
}

export function shopCardWidth(windowWidth: number) {
  return (shopListWidth(windowWidth) - ShopGrid.pad * 2 - ShopGrid.gap) / 2;
}

/** Clipart: category rail on the left, three-column grid beside it. */
export const ClipartGrid = { railWidth: 84, columns: 3, gap: 6, pad: 8 } as const;

export function clipartTileWidth(windowWidth: number) {
  const { railWidth, columns, gap, pad } = ClipartGrid;
  return Math.floor((windowWidth - railWidth - pad * 2 - gap * (columns - 1)) / columns);
}

/** Data files: three-column file grid. */
export const DataFileGrid = { columns: 3, gap: 10, pad: 12 } as const;

export function dataFileTileWidth(windowWidth: number) {
  const { columns, gap, pad } = DataFileGrid;
  return Math.floor((Math.min(windowWidth, MaxContentWidth) - pad * 2 - gap * (columns - 1)) / columns);
}

/** Templates tab: content column and the widest a template card may be beside the category rail. */
export function templateLayout(windowWidth: number) {
  const layoutWidth = Math.min(windowWidth, MaxContentWidth);
  return { layoutWidth, cardMaxWidth: Math.min(520, layoutWidth - 124) };
}

/** Print screen: preview card width and the 42 % height cap (before zoom). */
export function printPreviewBounds(windowWidth: number, windowHeight: number) {
  return {
    baseCardWidth: Math.min(windowWidth - 48, MaxContentWidth - 48),
    maxPreviewHeight: Math.round(windowHeight * 0.42),
  };
}

/** PDF thermal: page preview inside the print modal. */
export function pdfModalPreviewSize(
  windowWidth: number,
  windowHeight: number,
  page: { widthMm: number; heightMm: number } | null,
) {
  const width = Math.min(windowWidth - 64, 320);
  const height =
    page && page.widthMm > 0
      ? Math.min(Math.round((width * page.heightMm) / page.widthMm), Math.round(windowHeight * 0.36))
      : 220;
  return { width, height };
}

/** OCR: square image preview. */
export function ocrPreviewSize(windowWidth: number) {
  return Math.min(Math.round(windowWidth * 0.62), 260);
}

/** Scan: square camera viewfinder. */
export function scanFrameSize(windowWidth: number) {
  return Math.min(Math.round(windowWidth * 0.72), 280);
}

/** Scan: dark band above the viewfinder, never under the header. */
export function scanTopMaskHeight(windowHeight: number, frameSize: number, insetTop: number) {
  return Math.max((windowHeight - frameSize) / 2 - 40, insetTop + 70);
}

/** Editor: canvas + panel height to assume before the split view has been measured. */
export function editorFallbackViewportPx(windowHeight: number) {
  return Math.max(windowHeight, 560) * 0.62;
}
