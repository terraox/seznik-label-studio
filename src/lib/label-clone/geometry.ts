import { clampLabelMm, LABEL_SIZE_PRESETS, type LabelSizeMm } from '@/lib/label-geometry';

import type {
  CloneDetection,
  CloneMapping,
  CloneMmBox,
  CloneNormBox,
  CloneOcrLine,
  ClonePxBox,
} from './types';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function aspectRatio(width: number, height: number): number {
  return Math.max(0.05, width) / Math.max(0.05, height);
}

export function aspectsClose(a: number, b: number, logTolerance = 0.22): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(Math.log(a / b)) <= logTolerance;
}

export function inflatePxBox(box: ClonePxBox, pad: number, imageWidth: number, imageHeight: number): ClonePxBox {
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const right = Math.min(imageWidth, box.left + box.width + pad);
  const bottom = Math.min(imageHeight, box.top + box.height + pad);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function unionPxBoxes(boxes: ClonePxBox[]): ClonePxBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    if (!(box.width > 0) || !(box.height > 0)) continue;
    minX = Math.min(minX, box.left);
    minY = Math.min(minY, box.top);
    maxX = Math.max(maxX, box.left + box.width);
    maxY = Math.max(maxY, box.top + box.height);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

export function codeHitToPxBox(
  box: CloneNormBox | undefined,
  imageWidth: number,
  imageHeight: number,
): ClonePxBox | null {
  if (!box) return null;
  const width = box.w * imageWidth;
  const height = box.h * imageHeight;
  if (!(width > 1) || !(height > 1)) return null;
  return {
    left: box.x * imageWidth,
    top: box.y * imageHeight,
    width,
    height,
  };
}

export function detectionInkBoxes(detection: CloneDetection): ClonePxBox[] {
  const boxes: ClonePxBox[] = [];
  for (const line of detection.lines) {
    if (line.frame && line.frame.width > 1 && line.frame.height > 1) boxes.push(line.frame);
  }
  for (const code of detection.codes) {
    const px = code.pxBox ?? codeHitToPxBox(code.box, detection.imageWidth, detection.imageHeight);
    if (px) boxes.push(px);
  }
  return boxes;
}

/**
 * Pixel rectangle we map onto stock. Crops table/background when the label
 * is inset on two opposite sides; otherwise uses the full photo so missed
 * OCR at the bottom does not stretch the top half across the canvas.
 */
export function cloneSourceRect(detection: CloneDetection): ClonePxBox {
  const imageWidth = Math.max(1, detection.imageWidth);
  const imageHeight = Math.max(1, detection.imageHeight);
  const full = { left: 0, top: 0, width: imageWidth, height: imageHeight };
  const ink = unionPxBoxes(detectionInkBoxes(detection));
  if (!ink) return full;

  const leftM = ink.left / imageWidth;
  const topM = ink.top / imageHeight;
  const rightM = (imageWidth - (ink.left + ink.width)) / imageWidth;
  const bottomM = (imageHeight - (ink.top + ink.height)) / imageHeight;
  const cropX = leftM > 0.06 && rightM > 0.06;
  const cropY = topM > 0.06 && bottomM > 0.06;
  if (!cropX && !cropY) return full;

  const pad = Math.max(6, Math.min(imageWidth, imageHeight) * 0.02);
  let left = cropX ? ink.left : 0;
  let top = cropY ? ink.top : 0;
  let right = cropX ? ink.left + ink.width : imageWidth;
  let bottom = cropY ? ink.top + ink.height : imageHeight;
  const padded = inflatePxBox(
    { left, top, width: right - left, height: bottom - top },
    pad,
    imageWidth,
    imageHeight,
  );
  if (padded.width < imageWidth * 0.18 || padded.height < imageHeight * 0.18) return full;
  return padded;
}

export function createCloneMapping(
  content: ClonePxBox,
  widthMm: number,
  heightMm: number,
  imageWidth = content.width,
  imageHeight = content.height,
): CloneMapping {
  const contentAspect = aspectRatio(content.width, content.height);
  const stockAspect = aspectRatio(widthMm, heightMm);
  let originXMm = 0;
  let originYMm = 0;
  let mapWidthMm = widthMm;
  let mapHeightMm = heightMm;
  if (contentAspect > stockAspect * 1.05) {
    mapHeightMm = widthMm / contentAspect;
    originYMm = (heightMm - mapHeightMm) / 2;
  } else if (contentAspect < stockAspect / 1.05) {
    mapWidthMm = heightMm * contentAspect;
    originXMm = (widthMm - mapWidthMm) / 2;
  }
  return {
    imageWidth: Math.max(1, imageWidth),
    imageHeight: Math.max(1, imageHeight),
    content,
    originXMm,
    originYMm,
    mapWidthMm,
    mapHeightMm,
    widthMm,
    heightMm,
  };
}

export function mapFrameToMm(frame: ClonePxBox, mapping: CloneMapping): CloneMmBox {
  const cw = Math.max(1, mapping.content.width);
  const ch = Math.max(1, mapping.content.height);
  return {
    left: mapping.originXMm + ((frame.left - mapping.content.left) / cw) * mapping.mapWidthMm,
    top: mapping.originYMm + ((frame.top - mapping.content.top) / ch) * mapping.mapHeightMm,
    width: (frame.width / cw) * mapping.mapWidthMm,
    height: (frame.height / ch) * mapping.mapHeightMm,
  };
}

export function mapPxBoxToMm(
  frame: ClonePxBox,
  imageWidth: number,
  imageHeight: number,
  widthMm: number,
  heightMm: number,
): CloneMmBox {
  return mapFrameToMm(
    frame,
    createCloneMapping(
      { left: 0, top: 0, width: imageWidth, height: imageHeight },
      widthMm,
      heightMm,
      imageWidth,
      imageHeight,
    ),
  );
}

export function mapNormBoxToMm(box: CloneNormBox, mapping: CloneMapping): CloneMmBox {
  return mapFrameToMm(
    {
      left: box.x * mapping.imageWidth,
      top: box.y * mapping.imageHeight,
      width: box.w * mapping.imageWidth,
      height: box.h * mapping.imageHeight,
    },
    mapping,
  );
}

/**
 * Barcode scanner corners/bounds may be pixels of the oriented photo, pixels
 * of an EXIF-unrotated bitmap, or already normalized 0–1.
 */
export function normalizeScannerBox(
  raw: ClonePxBox,
  imageWidth: number,
  imageHeight: number,
): CloneNormBox | null {
  const x = raw.left;
  const y = raw.top;
  const w = raw.width;
  const h = raw.height;
  if (!(w > 0) || !(h > 0) || imageWidth <= 0 || imageHeight <= 0) return null;

  const unit = x >= 0 && y >= 0 && x + w <= 1.2 && y + h <= 1.2 && w <= 1.2 && h <= 1.2;
  if (unit && imageWidth > 8 && imageHeight > 8) {
    return { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) };
  }

  const fits = (maxX: number, maxY: number) => x >= -2 && y >= -2 && x + w <= maxX * 1.08 && y + h <= maxY * 1.08;

  if (fits(imageWidth, imageHeight)) {
    return {
      x: clamp01(x / imageWidth),
      y: clamp01(y / imageHeight),
      w: clamp01(w / imageWidth),
      h: clamp01(h / imageHeight),
    };
  }

  if (fits(imageHeight, imageWidth)) {
    const left = y;
    const top = imageHeight - x - w;
    return {
      x: clamp01(left / imageWidth),
      y: clamp01(top / imageHeight),
      w: clamp01(h / imageWidth),
      h: clamp01(w / imageHeight),
    };
  }

  return {
    x: clamp01(x / imageWidth),
    y: clamp01(y / imageHeight),
    w: clamp01(w / imageWidth),
    h: clamp01(h / imageHeight),
  };
}

function isAutoStockCandidate(widthMm: number, heightMm: number, id: string): boolean {
  if (widthMm >= 180 || heightMm >= 180) return false;
  if (widthMm < 22 && heightMm > 50) return false;
  if (heightMm < 18 && widthMm > 70) return false;
  if (/jewel|cable|barbell|rat.?tail|2up|3up/i.test(id)) return false;
  return true;
}

export function looksLikeWaybill(detection: Pick<CloneDetection, 'codes' | 'lines'>): boolean {
  const lines = detection.lines.filter((line) => line.text.trim().length >= 2).length;
  const hasQr = detection.codes.some((code) => code.kind === 'qr');
  const hasBarcode = detection.codes.some((code) => code.kind === 'barcode');
  if (hasQr && hasBarcode && lines >= 4) return true;
  if (detection.codes.length >= 1 && lines >= 8) return true;
  return lines >= 12;
}

export function resolveCloneStockSize(
  detection: CloneDetection,
  preferredWidthMm: number,
  preferredHeightMm: number,
): LabelSizeMm {
  const preferred = clampLabelMm(preferredWidthMm, preferredHeightMm);
  const source = cloneSourceRect(detection);
  const contentAspect = aspectRatio(source.width, source.height);
  const preferredAspect = aspectRatio(preferred.widthMm, preferred.heightMm);
  if (aspectsClose(contentAspect, preferredAspect, 0.2)) return preferred;

  const portrait = contentAspect < 0.98;
  const waybill = looksLikeWaybill(detection);
  let best = preferred;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const preset of LABEL_SIZE_PRESETS) {
    if (!isAutoStockCandidate(preset.widthMm, preset.heightMm, preset.id)) continue;
    const presetAspect = aspectRatio(preset.widthMm, preset.heightMm);
    if (portrait && presetAspect > 1.08) continue;
    if (!portrait && presetAspect < 0.92) continue;
    const aspectDist = Math.abs(Math.log(presetAspect / contentAspect));
    const prefDist =
      Math.abs(Math.log(preset.widthMm / preferred.widthMm)) +
      Math.abs(Math.log(preset.heightMm / preferred.heightMm));
    let score = aspectDist * 4 + prefDist * 0.2;
    if (
      waybill &&
      preset.widthMm >= 90 &&
      preset.widthMm <= 110 &&
      preset.heightMm >= 140 &&
      preset.heightMm <= 160
    ) {
      score -= 0.4;
    }
    if (score < bestScore) {
      bestScore = score;
      best = clampLabelMm(preset.widthMm, preset.heightMm);
    }
  }

  return best;
}

export function attachLineBoxToCode(
  lines: CloneOcrLine[],
  payload: string,
  imageWidth: number,
  imageHeight: number,
  kind: 'barcode' | 'qr',
): CloneNormBox | undefined {
  const key = payload.replace(/\s+/g, '').toLowerCase();
  if (key.length < 4) return undefined;
  const match = lines.find((line) => line.frame && line.text.replace(/\s+/g, '').toLowerCase().includes(key));
  const frame = match?.frame;
  if (!frame || imageWidth < 2 || imageHeight < 2) return undefined;
  if (kind === 'qr') {
    const size = Math.max(frame.width, frame.height * 4);
    return {
      x: clamp01(frame.left / imageWidth),
      y: clamp01(Math.max(0, frame.top - size) / imageHeight),
      w: clamp01(size / imageWidth),
      h: clamp01(size / imageHeight),
    };
  }
  return {
    x: clamp01(frame.left / imageWidth),
    y: clamp01(Math.max(0, frame.top - frame.height * 2.2) / imageHeight),
    w: clamp01(frame.width / imageWidth),
    h: clamp01(Math.min(imageHeight, frame.height * 3.4) / imageHeight),
  };
}
