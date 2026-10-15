import { scanFromURLAsync, type BarcodeScanningResult } from 'expo-camera';

import { isQrScanType } from '@/constants/editor-bridge';
import { inspectOcrImage } from '@/lib/ocr/preprocess';
import { isOcrError, recognizeImage } from '@/lib/ocr';
import { payloadFromBarcodeResult, SCAN_CODE_TYPES } from '@/lib/scan-codes';

import { normalizeScannerBox } from './geometry';
import type { CloneCodeHit, CloneDetection, CloneOcrLine, ClonePxBox } from './types';

type BoundsLike = {
  origin?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
};

type ResultWithGeometry = BarcodeScanningResult & {
  bounds?: BoundsLike;
  cornerPoints?: { x?: number; y?: number }[];
};

function pxBoxFromResult(result: ResultWithGeometry): ClonePxBox | undefined {
  const pts = result.cornerPoints;
  if (Array.isArray(pts) && pts.length >= 2) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      const x = Number(p?.x);
      const y = Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (maxX > minX && maxY > minY) {
      return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
    }
  }
  const bounds = result.bounds;
  if (!bounds?.origin || !bounds.size) return undefined;
  const width = Number(bounds.size.width ?? 0);
  const height = Number(bounds.size.height ?? 0);
  if (!(width > 0) || !(height > 0)) return undefined;
  return {
    left: Number(bounds.origin.x ?? 0),
    top: Number(bounds.origin.y ?? 0),
    width,
    height,
  };
}

async function scanCodesRaw(uri: string): Promise<CloneCodeHit[]> {
  const hits: CloneCodeHit[] = [];
  try {
    const results = await scanFromURLAsync(uri, SCAN_CODE_TYPES);
    for (const result of results) {
      const payload = payloadFromBarcodeResult(result);
      if (!payload) continue;
      const isQr = isQrScanType(String(result.type || payload.type));
      const pxBox = pxBoxFromResult(result as ResultWithGeometry);
      hits.push({
        kind: isQr ? 'qr' : 'barcode',
        type: payload.type,
        data: payload.data,
        pxBox,
      });
    }
  } catch {
    // OCR may still rebuild tracking codes.
  }
  return hits;
}

async function readOcrLines(uri: string): Promise<{
  lines: CloneOcrLine[];
  imageWidth: number;
  imageHeight: number;
}> {
  try {
    const recognized = await recognizeImage(uri);
    const lines =
      recognized.lines.length > 0
        ? recognized.lines.map((line) => ({ text: line.text, frame: line.frame }))
        : recognized.text
            .split(/\n+/)
            .map((text) => ({ text: text.trim() }))
            .filter((line) => line.text.length > 0);
    return {
      lines,
      imageWidth: recognized.imageSize.width,
      imageHeight: recognized.imageSize.height,
    };
  } catch (error) {
    if (isOcrError(error) && error.code === 'no_text') {
      return { lines: [], imageWidth: 0, imageHeight: 0 };
    }
    return { lines: [], imageWidth: 0, imageHeight: 0 };
  }
}

/** OCR + barcode/QR scan of the whole photo, with frames for layout. */
export async function scanCloneImage(
  uri: string,
  fallbackWidth?: number,
  fallbackHeight?: number,
): Promise<CloneDetection> {
  let imageWidth = 0;
  let imageHeight = 0;
  try {
    const size = await inspectOcrImage(uri);
    imageWidth = size.width;
    imageHeight = size.height;
  } catch {
    imageWidth = fallbackWidth && fallbackWidth > 0 ? fallbackWidth : 0;
    imageHeight = fallbackHeight && fallbackHeight > 0 ? fallbackHeight : 0;
  }

  const [rawCodes, ocr] = await Promise.all([scanCodesRaw(uri), readOcrLines(uri)]);

  if (ocr.imageWidth > 0 && ocr.imageHeight > 0) {
    imageWidth = ocr.imageWidth;
    imageHeight = ocr.imageHeight;
  }

  const width = imageWidth || 1;
  const height = imageHeight || 1;
  const codes = rawCodes.map((hit) => ({
    ...hit,
    box: hit.pxBox ? normalizeScannerBox(hit.pxBox, width, height) ?? undefined : undefined,
  }));

  return {
    imageWidth: width,
    imageHeight: height,
    codes,
    lines: ocr.lines,
  };
}
