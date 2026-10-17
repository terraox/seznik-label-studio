import { ptToMm } from '@/lib/pdf-editor/session';
import { mmToDots } from '@/lib/printer/print-spec';

/** How many raster pixels to render per printed dot, so the final downscale stays crisp. */
const OVERSAMPLE = 1.0;
const MIN_RASTER_DPI = 96;
const MAX_RASTER_DPI = 600;
/** Largest page bitmap we ask the native renderer for. */
const MAX_RASTER_PIXELS = 16_000_000;

export type LabelRenderPlan = {
  dotsW: number;
  dotsH: number;
  /** DPI to render the whole source page at. */
  rasterDpi: number;
  /** Crop region as fractions of the page (top-left origin). Full page when uncropped. */
  src: { x: number; y: number; w: number; h: number };
  /** Size of the (unrotated) crop region once scaled to fit the label, in dots. */
  drawW: number;
  drawH: number;
  rotation: 0 | 90 | 180 | 270;
};

export function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

/**
 * Pure geometry shared by print: crop region, rotate, then fit it inside the
 * label (`contain`). Matches what the on-screen label preview shows.
 */
export function planLabelRender(args: {
  pageWpt: number;
  pageHpt: number;
  crop: { originNorm: { x: number; y: number }; sizeNorm: { w: number; h: number } } | null;
  rotationDeg: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** Raster pixels per output dot. Print and previews both use 1. */
  oversample?: number;
}): LabelRenderPlan {
  const dotsW = Math.max(1, mmToDots(args.widthMm, args.dpi));
  const dotsH = Math.max(1, mmToDots(args.heightMm, args.dpi));
  const rotation = normalizeRotation(args.rotationDeg);
  const src = args.crop
    ? {
        x: args.crop.originNorm.x,
        y: args.crop.originNorm.y,
        w: args.crop.sizeNorm.w,
        h: args.crop.sizeNorm.h,
      }
    : { x: 0, y: 0, w: 1, h: 1 };

  const pageMmW = ptToMm(Math.max(1, args.pageWpt));
  const pageMmH = ptToMm(Math.max(1, args.pageHpt));
  const srcMmW = Math.max(0.01, src.w * pageMmW);
  const srcMmH = Math.max(0.01, src.h * pageMmH);
  const swap = rotation === 90 || rotation === 270;
  const fitW = swap ? srcMmH : srcMmW;
  const fitH = swap ? srcMmW : srcMmH;

  // Dots per source mm after the fit.
  const k = Math.min(dotsW / fitW, dotsH / fitH);

  const pageInW = pageMmW / 25.4;
  const pageInH = pageMmH / 25.4;
  const wanted = k * 25.4 * (args.oversample ?? OVERSAMPLE);
  const budget = Math.sqrt(MAX_RASTER_PIXELS / Math.max(0.01, pageInW * pageInH));
  const rasterDpi = Math.round(Math.max(MIN_RASTER_DPI, Math.min(MAX_RASTER_DPI, budget, Math.max(wanted, MIN_RASTER_DPI))));

  return { dotsW, dotsH, rasterDpi, src, drawW: srcMmW * k, drawH: srcMmH * k, rotation };
}
