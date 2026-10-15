/**
 * Native image ingest: decode/downscale on a background thread
 * (`expo-image-manipulator`, the RN stand-in for `createImageBitmap`).
 */

import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getImagePixelSize } from '@/lib/file-import/resolve-image-size';

import { generateId } from '@/lib/label-document';
import {
  EDITOR_IMAGE_MAX_EDGE_PX,
  unreferencedManagedFiles,
  workingSizePx,
} from '@/lib/editor/image-ingest';
import { deleteSezprintFile, ensureSezprintDir, publishSezprintFile } from '@/lib/user-files/root';

export type IngestedEditorImage = {
  previewUri: string;
  printUri: string;
  widthPx: number;
  heightPx: number;
  workingWidthPx: number;
  workingHeightPx: number;
  originalAspect: number;
};

async function editorImageDir(): Promise<string> {
  return ensureSezprintDir('images');
}

async function persistToEditorDir(sourceUri: string, fileName: string): Promise<string> {
  const dir = await editorImageDir();
  const dest = `${dir}${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  await publishSezprintFile('images', dest);
  return dest;
}

/**
 * Decode the pick, keep a print-quality copy, and a ≤2000px working copy
 * for on-canvas drag. Yields so a loading spinner can paint first.
 */
export async function ingestEditorImage(source: {
  uri: string;
  width?: number;
  height?: number;
  /** Fit Label uses PNG so QR/barcode modules are not JPEG-rounded. */
  printFormat?: 'jpeg' | 'png';
}): Promise<IngestedEditorImage> {
  await new Promise<void>((resolve) => setTimeout(resolve, 16));

  const id = generateId();
  const png = source.printFormat === 'png';
  const context = ImageManipulator.manipulate(source.uri);
  const originalRef = await context.renderAsync();
  const widthPx = originalRef.width || source.width || 1;
  const heightPx = originalRef.height || source.height || 1;
  const printSaved = await originalRef.saveAsync({
    compress: png ? 1 : 0.92,
    format: png ? SaveFormat.PNG : SaveFormat.JPEG,
  });

  const working = workingSizePx(widthPx, heightPx, EDITOR_IMAGE_MAX_EDGE_PX);
  let previewSavedUri = printSaved.uri;
  if (working.downscaled) {
    const previewCtx = ImageManipulator.manipulate(printSaved.uri);
    previewCtx.resize({ width: working.widthPx, height: working.heightPx });
    const previewRef = await previewCtx.renderAsync();
    const previewSaved = await previewRef.saveAsync({
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    previewSavedUri = previewSaved.uri;
  }

  const printUri = await persistToEditorDir(printSaved.uri, png ? `${id}-print.png` : `${id}-print.jpg`);
  const previewUri = working.downscaled
    ? await persistToEditorDir(previewSavedUri, `${id}-preview.jpg`)
    : printUri;

  try {
    await Image.prefetch(previewUri);
  } catch {
    // Prefetch is best-effort; expo-image will decode on first paint.
  }

  return {
    previewUri,
    printUri,
    widthPx,
    heightPx,
    workingWidthPx: working.widthPx,
    workingHeightPx: working.heightPx,
    originalAspect: widthPx / heightPx,
  };
}

function sourceExtension(uri: string): string {
  const match = uri.match(/(\.[a-z0-9]+)(?:\?|#|$)/i);
  return match?.[1]?.toLowerCase() || '.bin';
}

async function makeFitLabelPreview(
  printUri: string,
  widthPx: number,
  heightPx: number,
  id: string,
): Promise<{ previewUri: string; workingWidthPx: number; workingHeightPx: number }> {
  const working = workingSizePx(widthPx, heightPx, EDITOR_IMAGE_MAX_EDGE_PX);
  if (!working.downscaled) {
    return { previewUri: printUri, workingWidthPx: widthPx, workingHeightPx: heightPx };
  }
  const previewCtx = ImageManipulator.manipulate(printUri);
  previewCtx.resize({ width: working.widthPx, height: working.heightPx });
  const previewRef = await previewCtx.renderAsync();
  const previewSaved = await previewRef.saveAsync({
    compress: 0.85,
    format: SaveFormat.JPEG,
  });
  const previewUri = await persistToEditorDir(previewSaved.uri, `${id}-preview.jpg`);
  return { previewUri, workingWidthPx: working.widthPx, workingHeightPx: working.heightPx };
}

/**
 * Fit Label ingest: keep original bytes, and use a PNG print master without
 * an extra resize. Full-frame PNG is copied; JPEG is encoded to PNG once.
 */
export async function ingestFitLabelImage(source: {
  uri: string;
  width?: number;
  height?: number;
  originalUri?: string;
  copyPrintBytes?: boolean;
}): Promise<IngestedEditorImage> {
  await new Promise<void>((resolve) => setTimeout(resolve, 16));

  const id = generateId();
  const originalUri = source.originalUri || source.uri;
  await persistToEditorDir(originalUri, `${id}-source${sourceExtension(originalUri)}`);

  const copyPrint = source.copyPrintBytes === true;
  let printUri: string;
  let widthPx = source.width && source.width > 0 ? source.width : 0;
  let heightPx = source.height && source.height > 0 ? source.height : 0;

  if (copyPrint) {
    printUri = await persistToEditorDir(source.uri, `${id}-print.png`);
    if (!widthPx || !heightPx) {
      const inspected = await ImageManipulator.manipulate(printUri).renderAsync();
      widthPx = inspected.width || 1;
      heightPx = inspected.height || 1;
    }
  } else {
    const context = ImageManipulator.manipulate(source.uri);
    const originalRef = await context.renderAsync();
    widthPx = originalRef.width || source.width || 1;
    heightPx = originalRef.height || source.height || 1;
    const printSaved = await originalRef.saveAsync({
      compress: 1,
      format: SaveFormat.PNG,
    });
    printUri = await persistToEditorDir(printSaved.uri, `${id}-print.png`);
  }

  const preview = await makeFitLabelPreview(printUri, widthPx, heightPx, id);
  try {
    await Image.prefetch(preview.previewUri);
  } catch {
    // Prefetch is best-effort; expo-image will decode on first paint.
  }

  return {
    previewUri: preview.previewUri,
    printUri,
    widthPx,
    heightPx,
    workingWidthPx: preview.workingWidthPx,
    workingHeightPx: preview.workingHeightPx,
    originalAspect: widthPx / heightPx,
  };
}

/**
 * Shrink a print master on a native thread before JS PNG decode.
 * Never upscales. Caller deletes `uri` when `downscaled` is true.
 */
export async function downscaleImageUriToMaxEdge(
  uri: string,
  maxEdgePx: number,
): Promise<{ uri: string; widthPx: number; heightPx: number; downscaled: boolean }> {
  let widthPx = 1;
  let heightPx = 1;
  try {
    const size = await getImagePixelSize(uri);
    widthPx = size.width;
    heightPx = size.height;
  } catch {
    const inspected = await ImageManipulator.manipulate(uri).renderAsync();
    widthPx = inspected.width || 1;
    heightPx = inspected.height || 1;
  }
  const working = workingSizePx(widthPx, heightPx, maxEdgePx);
  if (!working.downscaled) {
    return { uri, widthPx, heightPx, downscaled: false };
  }
  const resizeCtx = ImageManipulator.manipulate(uri);
  resizeCtx.resize({ width: working.widthPx, height: working.heightPx });
  const resized = await resizeCtx.renderAsync();
  const saved = await resized.saveAsync({
    compress: 1,
    format: SaveFormat.PNG,
  });
  return {
    uri: saved.uri,
    widthPx: working.widthPx,
    heightPx: working.heightPx,
    downscaled: true,
  };
}

export async function sweepEditorImageFiles(keepUris: string[]): Promise<void> {
  const dir = await editorImageDir().catch(() => null);
  if (!dir) return;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists || !info.isDirectory) return;
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  const stale = unreferencedManagedFiles(names, keepUris);
  await Promise.all(stale.map((name) => deleteSezprintFile(`${dir}${name}`)));
}
