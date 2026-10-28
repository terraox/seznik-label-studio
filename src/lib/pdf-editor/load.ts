import * as FileSystem from 'expo-file-system/legacy';
import { ParseSpeeds, PDFDocument } from 'pdf-lib';
import { renderPdfPage } from 'pdf-raster';

import { rasterPdfPageCached } from '@/lib/pdf-editor/raster';

type PdfMeta = { pageCount: number; pageSizesPt: { w: number; h: number }[] };

/**
 * Quick open: the native renderer reports the page count and first page size from a tiny
 * render, without reading the whole file into JS or parsing it. Every page is assumed to be
 * the first page's size until `loadPdfPageSizes` returns the real sizes. Falls back to the
 * full parse (which also gives the encrypted / invalid messages) if the native call fails.
 *
 * `previewDpi` renders page 1 at the editor's preview resolution instead of a throwaway
 * thumbnail and keeps it in the raster cache, so the first preview is already done when the
 * editor opens rather than starting a second render of the same page.
 */
export async function loadPdfMetadata(uri: string, previewDpi?: number): Promise<PdfMeta> {
  try {
    const page = previewDpi
      ? await rasterPdfPageCached(uri, 0, previewDpi)
      : await renderPdfPage(uri, 0, 8);
    if (page.pageCount >= 1 && page.widthPt > 0 && page.heightPt > 0) {
      const first = { w: page.widthPt, h: page.heightPt };
      if (!previewDpi) void FileSystem.deleteAsync(page.uri, { idempotent: true }).catch(() => {});
      return { pageCount: page.pageCount, pageSizesPt: Array.from({ length: page.pageCount }, () => first) };
    }
  } catch {
    // Fall through to the full parse.
  }
  return loadPdfPageSizes(uri);
}

/**
 * Exact size of every page. Each page is measured with a tiny native render, a few at a
 * time and off the JS thread. Reading and parsing the whole file in JS froze big PDFs, so
 * that is only the fallback (it also gives the encrypted / invalid messages).
 */
export async function loadPdfPageSizes(uri: string): Promise<PdfMeta> {
  try {
    const first = await renderPdfPage(uri, 0, 8);
    const pageCount = first.pageCount;
    if (pageCount >= 1) {
      const sizes: { w: number; h: number }[] = new Array(pageCount);
      sizes[0] = { w: first.widthPt, h: first.heightPt };
      void FileSystem.deleteAsync(first.uri, { idempotent: true }).catch(() => {});
      let next = 1;
      const worker = async () => {
        while (next < pageCount) {
          const index = next++;
          const page = await renderPdfPage(uri, index, 8);
          sizes[index] = { w: page.widthPt, h: page.heightPt };
          void FileSystem.deleteAsync(page.uri, { idempotent: true }).catch(() => {});
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (sizes.every((size) => size && size.w > 0 && size.h > 0)) {
        return { pageCount, pageSizesPt: sizes };
      }
    }
  } catch {
    // Fall through to the full parse.
  }
  return loadPdfPageSizesParsed(uri);
}

async function loadPdfPageSizesParsed(uri: string): Promise<PdfMeta> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  let doc: PDFDocument;
  try {
    // Default parseSpeed yields to the event loop every 100 objects, which makes big PDFs crawl.
    doc = await PDFDocument.load(b64, {
      ignoreEncryption: false,
      parseSpeed: ParseSpeeds.Fastest,
      updateMetadata: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(msg)) {
      throw new Error('This PDF is encrypted or password-protected and cannot be opened.');
    }
    throw new Error('Could not read this PDF. The file may be invalid.');
  }
  const pageCount = doc.getPageCount();
  if (pageCount < 1) throw new Error('This PDF has no pages.');
  const pageSizesPt = doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { w: width, h: height };
  });
  return { pageCount, pageSizesPt };
}

/**
 * A PDF the renderer can read right now. The picker has already put the file in the app's cache, so a
 * local file path is opened as it is: no second copy before the first page appears. Anything else
 * (a content:// link from another app) is copied first, as before.
 */
export async function openPdfUri(sourceUri: string, name: string): Promise<string> {
  if (sourceUri.startsWith('file://')) return sourceUri;
  return copyPdfToCache(sourceUri, name);
}

export async function copyPdfToCache(sourceUri: string, name: string): Promise<string> {
  const { stageImportedFile } = await import('@/lib/user-files/stage-import');
  const safe = name.trim() || 'document.pdf';
  return stageImportedFile('pdf', sourceUri, safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`);
}
