import * as FileSystem from 'expo-file-system/legacy';
import { decodePng, encodePng } from '@/lib/fast-png-shim';
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
} from 'pdf-lib';

import { applyMonoToRgba, DEFAULT_GRAY_THRESHOLD, type EditorColorMode } from '@/lib/editor/image-mono';
import { pngBase64ToGray, type GrayRaster } from '@/lib/printer/escpos';
import { EXPORT_DPI, rasterPdfPageCached } from '@/lib/pdf-editor/raster';
import { renderPdfPage } from 'pdf-raster';
import {
  cropWindowPts,
  mmToPt,
  pageColorMode,
  resolveScopeIndices,
  shouldRasterizePage,
  stampRectInCropSpace,
  tiledRepeatCount,
  type PdfBoxPts,
  type PdfEditSession,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';
import { unsharpRgba } from '@/lib/pdf-editor/sharpen';
import { downscaleWatermarkTile, exportTileSize } from '@/lib/pdf-editor/watermark-tile';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function readBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function containInBox(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.min(dstW / Math.max(srcW, 1), dstH / Math.max(srcH, 1));
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: (dstW - w) / 2,
    y: (dstH - h) / 2,
    w,
    h,
    scale,
  };
}

function outputPagePts(session: PdfEditSession): { w: number; h: number } {
  return {
    w: Math.max(10, mmToPt(session.outputSize.widthMm)),
    h: Math.max(10, mmToPt(session.outputSize.heightMm)),
  };
}

function cropBoxForPage(session: PdfEditSession, pageIndex: number): PdfBoxPts {
  const size = session.pageSizesPt[pageIndex] ?? { w: 612, h: 792 };
  const cropPages = session.crop
    ? new Set(resolveScopeIndices(session.crop.scope, session.pageCount, session.currentPageIndex))
    : new Set<number>();
  if (!session.crop || !cropPages.has(pageIndex)) {
    return { x: 0, y: 0, w: size.w, h: size.h, fits: true };
  }
  return cropWindowPts(size, session.outputSize, session.crop.originNorm, session.crop.sizeNorm);
}

async function drawWatermark(
  out: PDFDocument,
  page: PDFPage,
  crop: PdfBoxPts,
  wm: PdfWatermark,
  pageMinSideMm: number,
) {
  const opacity = Math.min(1, Math.max(0, wm.opacity));
  const rotation = wm.rotationDeg;

  if (wm.layout === 'tiled') {
    const spacing = wm.tiled?.spacingNorm ?? { x: 0.24, y: 0.24 };
    const staggered = wm.tiled?.staggered ?? true;
    const { cols, rows } = tiledRepeatCount(spacing);
    const cellW = crop.w / cols;
    const cellH = crop.h / rows;

    if (wm.type === 'image' && wm.image?.sourceUri) {
      const tilePx = exportTileSize(pageMinSideMm, spacing);
      const tile = await downscaleWatermarkTile(wm.image.sourceUri, tilePx);
      const bytes = await readBytes(tile.tileUri);
      const img = await out.embedPng(bytes);
      for (let r = 0; r < rows; r++) {
        const staggerX = staggered && r % 2 === 1 ? cellW * 0.5 : 0;
        for (let c = -1; c <= cols; c++) {
          const x = crop.x + c * cellW + staggerX + cellW * 0.1;
          const y = crop.y + (rows - 1 - r) * cellH + cellH * 0.1;
          if (x + cellW * 0.8 < crop.x || x > crop.x + crop.w) continue;
          page.drawImage(img, {
            x,
            y,
            width: cellW * 0.8,
            height: cellH * 0.8,
            rotate: degrees(rotation),
            opacity,
          });
        }
      }
      return;
    }

    const font = await out.embedFont(StandardFonts.HelveticaBold);
    const text = wm.text?.content || 'WATERMARK';
    const color = hexToRgb(wm.text?.color || '#DC2626');
    const userPt = wm.text?.fontSizePt ?? 22;
    const size = Math.max(8, (userPt / 22) * Math.min(cellW, cellH) * 0.22);
    for (let r = 0; r < rows; r++) {
      const staggerX = staggered && r % 2 === 1 ? cellW * 0.5 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = crop.x + c * cellW + staggerX + cellW * 0.1;
        const y = crop.y + (rows - 1 - r) * cellH + cellH * 0.35;
        if (x + cellW * 0.8 < crop.x || x > crop.x + crop.w) continue;
        page.drawText(text, {
          x,
          y,
          size,
          font,
          color,
          rotate: degrees(rotation),
          opacity,
        });
      }
    }
    return;
  }

  const stamp = wm.stamp ?? {
    offsetNorm: { x: 0.5, y: 0.5 },
    sizeNorm: 0.42,
    anchor: 'center' as const,
  };
  const rect = stampRectInCropSpace(crop, stamp);

  if (wm.type === 'image' && wm.image?.sourceUri) {
    const bytes = await readBytes(wm.image.sourceUri);
    const img = bytes[0] === 0xff ? await out.embedJpg(bytes) : await out.embedPng(bytes);
    page.drawImage(img, {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      rotate: degrees(rotation),
      opacity,
    });
    return;
  }

  const font = await out.embedFont(StandardFonts.HelveticaBold);
  const text = wm.text?.content || 'WATERMARK';
  const color = hexToRgb(wm.text?.color || '#DC2626');
  const size = Math.max(12, rect.h * 0.42);
  page.drawText(text, {
    x: rect.x + rect.w * 0.08,
    y: rect.y + rect.h * 0.32,
    size,
    font,
    color,
    rotate: degrees(rotation),
    opacity,
  });
}

function rotateRgba(
  src: Uint8Array,
  width: number,
  height: number,
  deg: number,
): { data: Uint8Array; width: number; height: number } {
  const r = ((deg % 360) + 360) % 360;
  if (r === 0) return { data: src, width, height };
  if (r === 180) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        const di = ((height - 1 - y) * width + (width - 1 - x)) * 4;
        out[di] = src[si];
        out[di + 1] = src[si + 1];
        out[di + 2] = src[si + 2];
        out[di + 3] = src[si + 3];
      }
    }
    return { data: out, width, height };
  }
  const outW = height;
  const outH = width;
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const dx = r === 90 ? height - 1 - y : y;
      const dy = r === 90 ? x : width - 1 - x;
      const di = (dy * outW + dx) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width: outW, height: outH };
}

/** Crop using top-left fractions of the rendered page, so height is cut the same way as width. */
function cropRgbaNorm(
  src: Uint8Array,
  width: number,
  height: number,
  origin: { x: number; y: number },
  size: { w: number; h: number },
): { data: Uint8Array; width: number; height: number } {
  const x0 = Math.max(0, Math.min(width - 1, Math.round(origin.x * width)));
  const y0 = Math.max(0, Math.min(height - 1, Math.round(origin.y * height)));
  const cw = Math.max(1, Math.min(width - x0, Math.round(size.w * width)));
  const ch = Math.max(1, Math.min(height - y0, Math.round(size.h * height)));
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcOff = ((y0 + y) * width + x0) * 4;
    out.set(src.subarray(srcOff, srcOff + cw * 4), y * cw * 4);
  }
  return { data: out, width: cw, height: ch };
}

function cropRgba(
  src: Uint8Array,
  width: number,
  height: number,
  box: PdfBoxPts,
  pageWpt: number,
  pageHpt: number,
): { data: Uint8Array; width: number; height: number } {
  const x0 = Math.max(0, Math.floor((box.x / pageWpt) * width));
  const y0Top = Math.max(0, Math.floor(((pageHpt - box.y - box.h) / pageHpt) * height));
  const cw = Math.max(1, Math.min(width - x0, Math.round((box.w / pageWpt) * width)));
  const ch = Math.max(1, Math.min(height - y0Top, Math.round((box.h / pageHpt) * height)));
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcOff = ((y0Top + y) * width + x0) * 4;
    out.set(src.subarray(srcOff, srcOff + cw * 4), y * cw * 4);
  }
  return { data: out, width: cw, height: ch };
}

export type PdfExportProgress = (current: number, total: number) => void;

export type PdfExportResult = {
  uri: string;
  usedRaster: boolean[];
};

async function composeEditedPages(
  session: PdfEditSession,
  indices: number[],
  onProgress?: PdfExportProgress,
): Promise<{ doc: PDFDocument; usedRaster: boolean[] }> {
  const srcBytes = await readBytes(session.sourceUri);
  const srcDoc = await PDFDocument.load(srcBytes);
  const out = await PDFDocument.create();
  const usedRaster: boolean[] = [];

  const wmPages = session.watermark
    ? new Set(
        resolveScopeIndices(session.watermark.scope, session.pageCount, session.currentPageIndex),
      )
    : new Set<number>();

  for (let n = 0; n < indices.length; n++) {
    const i = indices[n];
    onProgress?.(n + 1, indices.length);
    const sharpness = session.sharpnessByPage[i] ?? 0;
    const rotation = session.rotationByPage[i] ?? 0;
    const box = cropBoxForPage(session, i);
    const pageSize = session.pageSizesPt[i] ?? { w: 612, h: 792 };
    const raster = shouldRasterizePage(sharpness);
    usedRaster.push(raster);

    const hasCrop =
      session.crop != null &&
      resolveScopeIndices(session.crop.scope, session.pageCount, session.currentPageIndex).includes(i);
    const target = outputPagePts(session);

    if (raster || hasCrop || rotation !== 0) {
      const rendered = await rasterPdfPageCached(session.sourceUri, i, EXPORT_DPI);
      const pngBytes = await readBytes(rendered.uri);
      const decoded = decodePng(pngBytes);
      const rgba = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
      const crop = session.crop;
      const norm = crop?.sizeNorm;
      const cropped =
        hasCrop && crop && norm && norm.w > 0 && norm.h > 0
          ? cropRgbaNorm(rgba, decoded.width, decoded.height, crop.originNorm, norm)
          : hasCrop
            ? cropRgba(rgba, decoded.width, decoded.height, box, pageSize.w, pageSize.h)
            : { data: rgba, width: decoded.width, height: decoded.height };
      const rotated = rotateRgba(cropped.data, cropped.width, cropped.height, rotation);
      const radius = Math.max(1, Math.round((EXPORT_DPI / 150) * 1));
      const sharp = unsharpRgba(rotated.data, rotated.width, rotated.height, sharpness, radius);
      const encoded = encodePng({
        width: rotated.width,
        height: rotated.height,
        data: sharp,
        depth: 8,
        channels: 4,
      });
      const page = out.addPage([target.w, target.h]);
      const img = await out.embedPng(encoded);
      const fit = containInBox(rotated.width, rotated.height, target.w, target.h);
      page.drawImage(img, { x: fit.x, y: fit.y, width: fit.w, height: fit.h });
      if (session.watermark && wmPages.has(i)) {
        const wmBox: PdfBoxPts = { x: 0, y: 0, w: target.w, h: target.h, fits: true };
        await drawWatermark(out, page, wmBox, session.watermark, (target.w * 25.4) / 72);
      }
      continue;
    }

    const embedded = await out.embedPage(srcDoc.getPage(i));
    const page = out.addPage([target.w, target.h]);
    const fit = containInBox(embedded.width, embedded.height, target.w, target.h);
    page.drawPage(embedded, {
      x: fit.x,
      y: fit.y,
      xScale: fit.scale,
      yScale: fit.scale,
    });
    if (session.watermark && wmPages.has(i)) {
      const wmBox: PdfBoxPts = { x: 0, y: 0, w: target.w, h: target.h, fits: true };
      await drawWatermark(out, page, wmBox, session.watermark, (target.w * 25.4) / 72);
    }
  }

  return { doc: out, usedRaster };
}

function rotatedPagePts(page: PDFPage): { w: number; h: number } {
  const size = page.getSize();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  if (angle === 90 || angle === 270) return { w: size.height, h: size.width };
  return { w: size.width, h: size.height };
}

async function writePdfFile(doc: PDFDocument, name: string): Promise<string> {
  const outB64 = await doc.saveAsBase64({ dataUri: false });
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const dir = `${root}pdf-editor/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const uri = `${dir}${name}`;
  await FileSystem.writeAsStringAsync(uri, outB64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

/** Raster pages that are not Original and bake B&W or halftone. */
async function flattenPdfColorMode(doc: PDFDocument, modes: EditorColorMode[]): Promise<PDFDocument> {
  if (modes.every((mode) => mode === 'Original')) return doc;
  const uri = await writePdfFile(doc, `flatten_${Date.now()}.pdf`);
  try {
    const next = await PDFDocument.create();
    const count = doc.getPageCount();
    for (let i = 0; i < count; i++) {
      const mode = modes[i] ?? 'Original';
      if (mode === 'Original') {
        const [copied] = await next.copyPages(doc, [i]);
        next.addPage(copied);
        continue;
      }
      const rendered = await renderPdfPage(uri, i, EXPORT_DPI);
      const pngBytes = await readBytes(rendered.uri);
      const decoded = decodePng(pngBytes);
      const rgba = new Uint8Array(decoded.data.length);
      rgba.set(decoded.data);
      applyMonoToRgba(rgba, decoded.width, decoded.height, DEFAULT_GRAY_THRESHOLD, mode);
      const encoded = encodePng({
        width: decoded.width,
        height: decoded.height,
        data: rgba,
        depth: 8,
        channels: 4,
      });
      const box = rotatedPagePts(doc.getPage(i));
      const page = next.addPage([box.w, box.h]);
      const img = await next.embedPng(encoded);
      page.drawImage(img, { x: 0, y: 0, width: box.w, height: box.h });
    }
    return next;
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

export type EditedPdfPageRaster = {
  pageIndex: number;
  widthMm: number;
  heightMm: number;
  gray: GrayRaster;
};

/**
 * Raster edited pages (crop, rotate, sharpness, watermark) at `dpi`.
 * Color stays in the luminance so the printer bridge can threshold or dither.
 */
export async function renderEditedPdfPages(
  session: PdfEditSession,
  pageIndices: number[],
  dpi: number,
  onProgress?: PdfExportProgress,
): Promise<EditedPdfPageRaster[]> {
  if (pageIndices.length === 0) return [];
  const { doc } = await composeEditedPages(session, pageIndices);
  const uri = await writePdfFile(doc, `print_${Date.now()}.pdf`);
  try {
    const pages: EditedPdfPageRaster[] = [];
    for (let n = 0; n < pageIndices.length; n++) {
      onProgress?.(n + 1, pageIndices.length);
      const rendered = await renderPdfPage(uri, n, dpi);
      const b64 = await FileSystem.readAsStringAsync(rendered.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const gray = pngBase64ToGray(b64);
      pages.push({
        pageIndex: pageIndices[n],
        widthMm: session.outputSize.widthMm,
        heightMm: session.outputSize.heightMm,
        gray,
      });
    }
    return pages;
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

export async function exportEditedPdf(
  session: PdfEditSession,
  onProgress?: PdfExportProgress,
): Promise<PdfExportResult> {
  const indices = Array.from({ length: session.pageCount }, (_, i) => i);
  const composed = await composeEditedPages(session, indices, onProgress);
  const colorModes = Array.from({ length: session.pageCount }, (_, i) => pageColorMode(session, i));
  const doc = colorModes.every((mode) => mode === 'Original')
    ? composed.doc
    : await flattenPdfColorMode(composed.doc, colorModes);
  const usedRaster = colorModes.every((mode) => mode === 'Original')
    ? composed.usedRaster
    : composed.usedRaster.map(() => true);

  const outB64 = await doc.saveAsBase64({ dataUri: false });
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const dir = `${root}pdf-editor/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const uri = `${dir}export_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(uri, outB64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri, usedRaster };
}
