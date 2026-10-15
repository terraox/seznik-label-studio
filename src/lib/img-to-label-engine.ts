/**
 * Img to Label Engine
 *
 * Core conversion logic: imported image → physical label print bitmap.
 *
 * The screen is only a preview; it must never determine the actual printed
 * dimensions. The final print bitmap is always calculated from:
 *   physical label mm × printer DPI
 *
 * This module is independent of any printer SDK — it produces a GrayRaster
 * that the existing universal-bridge sends to the connected printer.
 */

import { createPrintGeometry, mmToDots, type PrintGeometry } from '@/lib/printer/print-spec';
import {
  binarizeGrayForPrint,
  cropGrayRect,
  downsampleGrayToSize,
  lockGrayToCanvas,
  rotateGray,
  trimGrayInkBounds,
  type GrayRaster,
} from '@/lib/printer/escpos';

// ─── Types ─────────────────────────────────────────────────────────────────

export type FitMode = 'contain' | 'cover' | 'stretch';
export type Orientation = 'portrait' | 'landscape' | 'auto';
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'center' | 'bottom';

export type LabelCropNorm = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export interface ImgToLabelConfig {
  /** Physical label width in mm (as selected by user). */
  widthMm: number;
  /** Physical label height in mm (as selected by user). */
  heightMm: number;
  /** Printer DPI (from connected printer profile). */
  dpi: number;
  /** Image scaling mode. Default: contain. */
  fitMode: FitMode;
  /** Label orientation. Default: portrait. */
  orientation: Orientation;
  /** Image rotation in degrees (clockwise). Default: 0. */
  imageRotationDeg: 0 | 90 | 180 | 270;
  /** Horizontal alignment within the label. Default: center. */
  hAlign: HAlign;
  /** Vertical alignment within the label. Default: center. */
  vAlign: VAlign;
  /** Trim empty photo margins before fit (label photos / scans). Default: true. */
  trimBorder?: boolean;
  /** Inset from label edge in mm so ink stays inside the die-cut. Default: 0. */
  safeMarginMm?: number;
  /** Normalized crop of one label out of a sheet/photo (0–1). */
  cropNorm?: LabelCropNorm | null;
}

export interface PrintLabelResult {
  /** Physical label width in mm (after orientation). */
  widthMm: number;
  /** Physical label height in mm (after orientation). */
  heightMm: number;
  /** Print canvas width in printer dots. */
  widthPx: number;
  /** Print canvas height in printer dots. */
  heightPx: number;
  /** Printer DPI used. */
  dpi: number;
  /** Final print-ready grayscale bitmap. */
  gray: GrayRaster;
  /** Fit mode applied. */
  fitMode: FitMode;
  /** Full print geometry for TSPL SIZE command. */
  geometry: PrintGeometry;
}

// ─── Orientation ───────────────────────────────────────────────────────────

/**
 * Resolve orientation: if landscape, swap width/height.
 * If 'auto', choose based on the source image aspect ratio.
 */
export function resolveOrientation(
  widthMm: number,
  heightMm: number,
  orientation: Orientation,
  sourceWidth?: number,
  sourceHeight?: number,
): { widthMm: number; heightMm: number } {
  if (orientation === 'landscape') {
    return {
      widthMm: Math.max(widthMm, heightMm),
      heightMm: Math.min(widthMm, heightMm),
    };
  }
  if (orientation === 'auto' && sourceWidth && sourceHeight) {
    const imageIsLandscape = sourceWidth > sourceHeight;
    const labelIsPortrait = widthMm < heightMm;
    if (imageIsLandscape && labelIsPortrait) {
      return { widthMm: heightMm, heightMm: widthMm };
    }
    const imageIsPortrait = sourceHeight > sourceWidth;
    const labelIsLandscape = widthMm > heightMm;
    if (imageIsPortrait && labelIsLandscape) {
      return { widthMm: heightMm, heightMm: widthMm };
    }
  }
  // portrait (default) or auto with matching aspect
  return { widthMm, heightMm };
}

// ─── Print Canvas Calculation ──────────────────────────────────────────────

/**
 * Calculate the exact print canvas pixel dimensions for a physical label size
 * at a given DPI. Uses the authoritative print geometry engine.
 */
export function calcPrintCanvas(
  widthMm: number,
  heightMm: number,
  dpi: number,
): { widthPx: number; heightPx: number; geometry: PrintGeometry } {
  const geometry = createPrintGeometry(widthMm, heightMm, dpi);
  return {
    widthPx: geometry.sizeDotsW,
    heightPx: geometry.sizeDotsH,
    geometry,
  };
}

// ─── Alignment ─────────────────────────────────────────────────────────────

function alignOffset(align: HAlign | VAlign, dest: number, src: number): number {
  if (align === 'left' || align === 'top') return 0;
  if (align === 'right' || align === 'bottom') return dest - src;
  return Math.floor((dest - src) / 2);
}

function blitGray(
  src: GrayRaster,
  destW: number,
  destH: number,
  ox: number,
  oy: number,
): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  const out = new Uint8Array(width * height);
  out.fill(255);
  const copyW = Math.min(src.width, Math.max(0, width - Math.max(ox, 0)));
  const copyH = Math.min(src.height, Math.max(0, height - Math.max(oy, 0)));
  const srcX = Math.max(0, -ox);
  const srcY = Math.max(0, -oy);
  const destX = Math.max(0, ox);
  const destY = Math.max(0, oy);
  const rowW = Math.min(copyW, src.width - srcX, width - destX);
  const rowH = Math.min(copyH, src.height - srcY, height - destY);
  if (rowW <= 0 || rowH <= 0) return { width, height, gray: out };
  for (let y = 0; y < rowH; y++) {
    const srcRow = (srcY + y) * src.width + srcX;
    out.set(src.gray.subarray(srcRow, srcRow + rowW), (destY + y) * width + destX);
  }
  return { width, height, gray: out };
}

function nearestGrayToSize(src: GrayRaster, width: number, height: number): GrayRaster {
  const out = new Uint8Array(width * height);
  const srcW = src.width;
  const srcH = src.height;
  const gray = src.gray;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / height));
    const srcRow = sy * srcW;
    const outRow = y * width;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / width));
      out[outRow + x] = gray[srcRow + sx];
    }
  }
  return { width, height, gray: out };
}

/** Box-average when shrinking (keeps barcode bars). Nearest-neighbor when growing — bilinear blurs QR modules. */
export function resampleGrayToSize(src: GrayRaster, destW: number, destH: number): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  if (src.width === width && src.height === height) return src;
  if (width <= src.width && height <= src.height) {
    return downsampleGrayToSize(src, width, height);
  }
  return nearestGrayToSize(src, width, height);
}

/**
 * Apply alignment offsets to a contain-fitted image within the label canvas.
 * Returns a GrayRaster with the image placed according to alignment settings.
 */
function applyContainWithAlignment(
  src: GrayRaster,
  destW: number,
  destH: number,
  hAlign: HAlign,
  vAlign: VAlign,
): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  const scale = Math.min(width / Math.max(src.width, 1), height / Math.max(src.height, 1));
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const scaled = resampleGrayToSize(src, dw, dh);
  return blitGray(
    scaled,
    width,
    height,
    alignOffset(hAlign, width, scaled.width),
    alignOffset(vAlign, height, scaled.height),
  );
}

/**
 * Apply cover (fill) mode with alignment for crop positioning.
 */
function applyCoverWithAlignment(
  src: GrayRaster,
  destW: number,
  destH: number,
  hAlign: HAlign,
  vAlign: VAlign,
): GrayRaster {
  const width = Math.max(1, Math.round(destW));
  const height = Math.max(1, Math.round(destH));
  const scale = Math.max(width / Math.max(src.width, 1), height / Math.max(src.height, 1));
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const scaled = resampleGrayToSize(src, dw, dh);
  const cropX = alignOffset(hAlign, scaled.width, width);
  const cropY = alignOffset(vAlign, scaled.height, height);
  return blitGray(scaled, width, height, -cropX, -cropY);
}

function insetDots(totalDots: number, marginDots: number): number {
  return Math.max(1, totalDots - Math.max(0, marginDots) * 2);
}

export function clampLabelCropNorm(crop: LabelCropNorm): LabelCropNorm {
  const w = Math.min(1, Math.max(0.02, crop.w));
  const h = Math.min(1, Math.max(0.02, crop.h));
  const x = Math.min(1 - w, Math.max(0, crop.x));
  const y = Math.min(1 - h, Math.max(0, crop.y));
  return { x, y, w, h };
}

export function cropGrayByNorm(src: GrayRaster, crop: LabelCropNorm): GrayRaster {
  const next = clampLabelCropNorm(crop);
  const x = Math.round(next.x * src.width);
  const y = Math.round(next.y * src.height);
  const w = Math.max(1, Math.round(next.w * src.width));
  const h = Math.max(1, Math.round(next.h * src.height));
  return cropGrayRect(src, x, y, w, h);
}

/** Grow a tight ink box so QR quiet-zone and label edges stay inside the crop. */
export function expandLabelCropNorm(crop: LabelCropNorm, padRatio = 0.08): LabelCropNorm {
  const next = clampLabelCropNorm(crop);
  const padW = Math.max(0.01, next.w * Math.max(0, padRatio));
  const padH = Math.max(0.01, next.h * Math.max(0, padRatio));
  return clampLabelCropNorm({
    x: next.x - padW,
    y: next.y - padH,
    w: next.w + padW * 2,
    h: next.h + padH * 2,
  });
}

/** Tight rectangle around printed ink, as a 0–1 crop of the full page/photo. */
export function findLabelCropNorm(src: GrayRaster, whiteMin = 236): LabelCropNorm | null {
  const { width, height, gray } = src;
  const n = gray.length;
  if (n === 0 || width < 2 || height < 2) return null;

  const sampleCount = Math.min(n, 4096);
  const sample = new Uint8Array(sampleCount);
  const step = Math.max(1, Math.floor(n / sampleCount));
  let si = 0;
  for (let i = 0; i < n && si < sampleCount; i += step) sample[si++] = gray[i];
  sample.sort();
  const p90 = sample[Math.min(si - 1, Math.floor(si * 0.9))] ?? 255;
  const inkMax = Math.min(whiteMin, Math.max(40, p90 - 12));

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (gray[row + x] < inkMax) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return clampLabelCropNorm({
    x: minX / width,
    y: minY / height,
    w: (maxX - minX + 1) / width,
    h: (maxY - minY + 1) / height,
  });
}

function prepareSourceGray(
  gray: GrayRaster,
  trimBorder: boolean,
  cropNorm?: LabelCropNorm | null,
): GrayRaster {
  let next = gray;
  if (cropNorm) {
    next = cropGrayByNorm(next, cropNorm);
  }
  if (!trimBorder) return next;
  const trimmed = trimGrayInkBounds(next);
  return trimmed.width > 0 && trimmed.height > 0 ? trimmed : next;
}

/**
 * Render an imported image into a label-sized print bitmap.
 *
 * Pipeline:
 *   1. Crop in source image space, then optional border trim
 *   2. Apply image rotation (crop coordinates stay valid)
 *   3. Resolve label orientation (portrait/landscape/auto)
 *   4. Calculate print canvas from physical mm + DPI
 *   5. Apply fit mode (contain/cover/stretch) with alignment
 *   6. Return final GrayRaster at exact print resolution
 *
 * The returned bitmap is ready for `printArtworkJob` via universal-bridge.
 */
export function renderImgToLabel(
  sourceGray: GrayRaster,
  config: ImgToLabelConfig,
): PrintLabelResult {
  const trimBorder = config.trimBorder === true;
  const safeMarginMm = Math.max(0, config.safeMarginMm ?? 0);

  // Crop in the original photo/PDF page, then rotate that window.
  let gray = prepareSourceGray(sourceGray, trimBorder, config.cropNorm);
  if (config.imageRotationDeg) {
    gray = rotateGray(gray, config.imageRotationDeg);
  }

  // 2. Resolve orientation
  const oriented = resolveOrientation(
    config.widthMm,
    config.heightMm,
    config.orientation,
    gray.width,
    gray.height,
  );

  // 3. Calculate print canvas from physical dimensions + DPI
  const canvas = calcPrintCanvas(oriented.widthMm, oriented.heightMm, config.dpi);
  const marginDotsX = mmToDots(safeMarginMm, config.dpi);
  const marginDotsY = mmToDots(safeMarginMm, config.dpi);
  const innerW = insetDots(canvas.widthPx, marginDotsX);
  const innerH = insetDots(canvas.heightPx, marginDotsY);

  // 4. Apply fit mode with alignment inside the safe inner rect, then lock to full canvas
  let inner: GrayRaster;
  switch (config.fitMode) {
    case 'contain':
      inner = applyContainWithAlignment(gray, innerW, innerH, config.hAlign, config.vAlign);
      break;
    case 'cover':
      inner = applyCoverWithAlignment(gray, innerW, innerH, config.hAlign, config.vAlign);
      break;
    case 'stretch':
      inner = resampleGrayToSize(gray, innerW, innerH);
      break;
    default:
      inner = applyContainWithAlignment(gray, innerW, innerH, config.hAlign, config.vAlign);
  }

  let result = inner;
  if (safeMarginMm > 0) {
    result = padInnerOnCanvas(inner, canvas.widthPx, canvas.heightPx, marginDotsX, marginDotsY);
  }
  result = lockGrayToCanvas(result, canvas.widthPx, canvas.heightPx);

  return {
    widthMm: oriented.widthMm,
    heightMm: oriented.heightMm,
    widthPx: canvas.widthPx,
    heightPx: canvas.heightPx,
    dpi: config.dpi,
    gray: result,
    fitMode: config.fitMode,
    geometry: canvas.geometry,
  };
}

/** Place inner raster onto full label canvas with symmetric margin. */
function padInnerOnCanvas(
  inner: GrayRaster,
  canvasW: number,
  canvasH: number,
  marginDotsX: number,
  marginDotsY: number,
): GrayRaster {
  const width = Math.max(1, Math.round(canvasW));
  const height = Math.max(1, Math.round(canvasH));
  const out = new Uint8Array(width * height);
  out.fill(255);
  const ox = Math.max(0, marginDotsX);
  const oy = Math.max(0, marginDotsY);
  const copyW = Math.min(inner.width, width - ox);
  const copyH = Math.min(inner.height, height - oy);
  for (let y = 0; y < copyH; y++) {
    out.set(
      inner.gray.subarray(y * inner.width, y * inner.width + copyW),
      (oy + y) * width + ox,
    );
  }
  return { width, height, gray: out };
}

/**
 * Apply contrast stretch + 1-bit conversion for thermal print and WYSIWYG preview.
 * Output is pure black/white so native SDK re-threshold cannot fade thin strokes.
 */
export function finalizeImgToLabelForPrint(
  result: PrintLabelResult,
  options: { threshold: number; dither?: boolean },
): PrintLabelResult {
  const gray = binarizeGrayForPrint(result.gray, {
    threshold: options.threshold,
    dither: options.dither ?? false,
    stretchContrast: true,
  });
  return { ...result, gray };
}

// ─── Preview helpers ───────────────────────────────────────────────────────

/**
 * Calculate the editor/preview scale for displaying the label on screen.
 * The preview must maintain the correct physical aspect ratio but fit
 * within the available screen space.
 *
 * IMPORTANT: This scale is only for display. Print uses physical mm + DPI.
 */
export function calcPreviewScale(
  widthMm: number,
  heightMm: number,
  maxScreenWidth: number,
  maxScreenHeight: number,
): { previewWidth: number; previewHeight: number; scale: number } {
  const wMm = Math.max(1, widthMm);
  const hMm = Math.max(1, heightMm);
  const scale = Math.min(
    maxScreenWidth / wMm,
    maxScreenHeight / hMm,
  );
  return {
    previewWidth: Math.max(1, Math.round(wMm * scale)),
    previewHeight: Math.max(1, Math.round(hMm * scale)),
    scale,
  };
}

/**
 * Default configuration for Img to Label.
 * Contain mode is the default — preserves the entire image visible.
 */
export function defaultImgToLabelConfig(
  widthMm: number,
  heightMm: number,
  dpi: number,
): ImgToLabelConfig {
  return {
    widthMm,
    heightMm,
    dpi,
    fitMode: 'contain',
    orientation: 'portrait',
    imageRotationDeg: 0,
    hAlign: 'center',
    vAlign: 'center',
    trimBorder: false,
    safeMarginMm: 0,
  };
}
