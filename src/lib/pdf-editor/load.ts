import * as FileSystem from 'expo-file-system/legacy';
import { ParseSpeeds, PDFDocument } from 'pdf-lib';
import { renderPdfPage } from 'pdf-raster';

type PdfMeta = { pageCount: number; pageSizesPt: { w: number; h: number }[] };

/**
 * Quick open: the native renderer reports the page count and first page size from a tiny
 * render, without reading the whole file into JS or parsing it. Every page is assumed to be
 * the first page's size until `loadPdfPageSizes` returns the real sizes. Falls back to the
 * full parse (which also gives the encrypted / invalid messages) if the native call fails.
 */
export async function loadPdfMetadata(uri: string): Promise<PdfMeta> {
  try {
    const page = await renderPdfPage(uri, 0, 8);
    if (page.pageCount >= 1 && page.widthPt > 0 && page.heightPt > 0) {
      const first = { w: page.widthPt, h: page.heightPt };
      return { pageCount: page.pageCount, pageSizesPt: Array.from({ length: page.pageCount }, () => first) };
    }
  } catch {
    // Fall through to the full parse.
  }
  return loadPdfPageSizes(uri);
}

/** Exact size of every page. Reads and parses the whole file, so run it after the editor is open. */
export async function loadPdfPageSizes(uri: string): Promise<PdfMeta> {
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

export async function copyPdfToCache(sourceUri: string, name: string): Promise<string> {
  const { stageImportedFile } = await import('@/lib/user-files/stage-import');
  const safe = name.trim() || 'document.pdf';
  return stageImportedFile('pdf', sourceUri, safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`);
}
