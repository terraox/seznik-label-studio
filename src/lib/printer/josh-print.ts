import {
  JOSH_MEDIA_ORIGIN_H_MM,
  dotsPerMm,
  mmToDots,
  type PrinterAlignment,
} from '@/lib/printer/print-spec';
import type { LabelOrientation } from '@/lib/label-document';
import type { RasterizeOptions } from '@/printing/raster/skia-rasterizer';

/**
 * DothanTech / JOSH LPAPI heads are 203 DPI (8 dots/mm).
 * The app's shared printerDpi defaults to 304 for TD-404 and must not leak here:
 * a 50×30 mm capture at 12 dpm is 600×360 dots → ~75×45 mm on a 203 DPI head.
 */
export const JOSH_HARDWARE_DPI = 203;
// Derived from print-spec.ts `dotsPerMm` — the single source of truth for the
// 304→12 / 203→8 hardware special case. Do not re-hardcode 8 elsewhere.
export const JOSH_DOTS_PER_MM = dotsPerMm(JOSH_HARDWARE_DPI);

/**
 * IDzPrinter.PrintParamValue in LPAPI-2026-01-08-R.jar.
 * GAP_NONE 0, GAP_HOLE 1, GAP_GAP 2, GAP_BLACK 3.
 * Cardstock and Transparent have no SDK value; they use GAP_GAP.
 */
export const JOSH_GAP_TYPE = {
  printerDefault: -1,
  receipt: 0,
  hole: 1,
  label: 2,
  blackMark: 3,
} as const;

export function joshEffectiveDpi(settingsDpi?: number | null): number {
  if (settingsDpi === 300) return 300;
  if (settingsDpi === 203) return 203;
  return JOSH_HARDWARE_DPI;
}

export function joshLabelDots(
  widthMm: number,
  heightMm: number,
  dpi = JOSH_HARDWARE_DPI,
): { widthDots: number; heightDots: number } {
  const dpm = dpi === 203 ? JOSH_DOTS_PER_MM : dotsPerMm(dpi);
  return {
    widthDots: Math.max(1, Math.round(widthMm * dpm)),
    heightDots: Math.max(1, Math.round(heightMm * dpm)),
  };
}

export function joshGapTypeFromMedia(
  media: 'gap' | 'bline' | 'continuous' | undefined,
): number {
  if (media === 'continuous') return JOSH_GAP_TYPE.receipt;
  if (media === 'bline') return JOSH_GAP_TYPE.blackMark;
  return JOSH_GAP_TYPE.label;
}

/**
 * LPAPI startJob+drawBitmap(mm) sits ~1 mm right and down vs Skia / ViewShot at the
 * same nominal offsets. Baked into the bitmap or capture; native h/v stay 0 at 0°.
 */
export const JOSH_LPAPI_DRAW_BIAS_H_MM = -1;
export const JOSH_LPAPI_DRAW_BIAS_V_MM = -1;

/** User + die-cut media origin + LPAPI draw bias (millimetres). */
export function joshInkOffsetMm(horizontalOffsetMm: number, verticalOffsetMm: number): {
  x: number;
  y: number;
} {
  return {
    x:
      horizontalOffsetMm +
      JOSH_MEDIA_ORIGIN_H_MM +
      JOSH_LPAPI_DRAW_BIAS_H_MM,
    y: verticalOffsetMm + JOSH_LPAPI_DRAW_BIAS_V_MM,
  };
}

export function joshInkShiftDots(
  horizontalOffsetMm: number,
  verticalOffsetMm: number,
  dpi: number,
): { x: number; y: number } {
  const ink = joshInkOffsetMm(horizontalOffsetMm, verticalOffsetMm);
  return { x: mmToDots(ink.x, dpi), y: mmToDots(ink.y, dpi) };
}

/**
 * Opt-in: white dots added to the right of the Josh page (and the same width to the LPAPI
 * job). 0 = off, page and job are exactly the label size, which keeps the job width the
 * printer already accepts. The border offset below keeps the right stroke inside the
 * 400 dot bitmap at a 3 mm gap, so the pad is not needed.
 */
export const JOSH_BORDER_PAD_DOTS = 0;

/**
 * Only used when the pad is on: LPAPI is assumed to center a wider job on the head, so
 * every layer would move left by half the pad. Added to the ink shift to cancel that.
 */
export const JOSH_PAD_CENTER_COMP_DOTS = JOSH_BORDER_PAD_DOTS / 2;

/**
 * Border only. Where the border layer sits: its own fixed shift in mm, applied to label
 * coordinates. It does not use the ink shift, the user H/V offsets or the element offset
 * below, so moving elements never moves borders. Tuned on printed labels; a shift of 0
 * left the border off the die-cut, so do not zero it.
 */
export const JOSH_BORDER_SHIFT_MM = { x: 0.6, y: -1 };

/**
 * Elements only (text, barcodes, shapes, images). Extra rightward move on top of the
 * ink shift. Borders do not use it.
 */
export const JOSH_ELEMENT_X_OFFSET_MM = 3;

/**
 * Stroke CENTER distance from the die-cut edge on all four sides. The print head is
 * 384 dots (48 mm) on a 50 mm label, so the right ~3 mm of the label is out of reach;
 * 3 mm keeps the right side inside what the head can print. Test, then tune.
 */
export const JOSH_BORDER_CENTER_GAP_MM = 3;
export const JOSH_BORDER_GAP_MIN_MM = 1;
export const JOSH_BORDER_GAP_MAX_MM = 10;

/** User value for one border, clamped; falls back to the default. */
export function joshBorderGapMm(edgeGapMm: number | undefined): number {
  if (edgeGapMm == null || !Number.isFinite(edgeGapMm)) return JOSH_BORDER_CENTER_GAP_MM;
  return Math.min(JOSH_BORDER_GAP_MAX_MM, Math.max(JOSH_BORDER_GAP_MIN_MM, edgeGapMm));
}

/** Headless Skia mono options for JOSH (ceil width pack + baked ink shift). */
export function joshHeadlessRasterOptions(
  dpi: number,
  horizontalOffsetMm: number,
  verticalOffsetMm: number,
  extra: Omit<RasterizeOptions, 'pageWidthPack' | 'shiftDots' | 'edgeBorders'> = {},
  /** Print-page "Elements offset" and "Border offset" (mm), on top of the baked shifts. */
  layerOffsetsMm: { elements: { x: number; y: number }; border: { x: number; y: number } } = {
    elements: { x: 0, y: 0 },
    border: { x: 0, y: 0 },
  },
): RasterizeOptions {
  const ink = joshInkShiftDots(horizontalOffsetMm, verticalOffsetMm, dpi);
  const elementX = mmToDots(JOSH_ELEMENT_X_OFFSET_MM, dpi);
  return {
    ...extra,
    pageWidthPack: 'ceil',
    edgeBorders: {
      padRightDots: JOSH_BORDER_PAD_DOTS,
      centerGapMm: JOSH_BORDER_CENTER_GAP_MM,
      shiftDots: {
        x: mmToDots(JOSH_BORDER_SHIFT_MM.x, dpi) + mmToDots(layerOffsetsMm.border.x, dpi),
        y: mmToDots(JOSH_BORDER_SHIFT_MM.y, dpi) + mmToDots(layerOffsetsMm.border.y, dpi),
      },
    },
    shiftDots: {
      x:
        ink.x +
        elementX +
        (JOSH_BORDER_PAD_DOTS > 0 ? JOSH_PAD_CENTER_COMP_DOTS : 0) +
        mmToDots(layerOffsetsMm.elements.x, dpi),
      y: ink.y + mmToDots(layerOffsetsMm.elements.y, dpi),
    },
  };
}

/**
 * Headless Skia mono options for a JOSH job turned 90/180/270. Same layers and fixed shifts as
 * the 0° options, but the label is turned in dots. The printer offset, the fixed element shift
 * and the border's fixed shift act in the paper frame (after the turn, where the print head is).
 * The Elements offset acts on the label before the turn. `layerOffsetsMm.border` must already be
 * in the paper frame (offsetToPaperFrame).
 */
export function joshRotatedRasterOptions(
  dpi: number,
  horizontalOffsetMm: number,
  verticalOffsetMm: number,
  rotationDeg: LabelOrientation,
  extra: Omit<RasterizeOptions, 'pageWidthPack' | 'shiftDots' | 'edgeBorders'> = {},
  layerOffsetsMm: { elements: { x: number; y: number }; border: { x: number; y: number } },
): RasterizeOptions {
  const ink = joshInkShiftDots(horizontalOffsetMm, verticalOffsetMm, dpi);
  const elementX = mmToDots(JOSH_ELEMENT_X_OFFSET_MM, dpi);
  return {
    ...extra,
    pageWidthPack: 'ceil',
    rotationDeg,
    edgeBorders: {
      padRightDots: JOSH_BORDER_PAD_DOTS,
      centerGapMm: JOSH_BORDER_CENTER_GAP_MM,
      shiftDots: {
        x: mmToDots(JOSH_BORDER_SHIFT_MM.x, dpi) + mmToDots(layerOffsetsMm.border.x, dpi),
        y: mmToDots(JOSH_BORDER_SHIFT_MM.y, dpi) + mmToDots(layerOffsetsMm.border.y, dpi),
      },
    },
    shiftDots: {
      x: mmToDots(layerOffsetsMm.elements.x, dpi),
      y: mmToDots(layerOffsetsMm.elements.y, dpi),
    },
    paperShiftDots: {
      x: ink.x + elementX + (JOSH_BORDER_PAD_DOTS > 0 ? JOSH_PAD_CENTER_COMP_DOTS : 0),
      y: ink.y,
    },
  };
}

export type JoshDrawRectMm = {
  xMm: number;
  yMm: number;
  drawWidthMm: number;
  drawHeightMm: number;
};

/**
 * LPAPI startJob(widthMm, heightMm) makes the page equal the physical label.
 * Printhead centering is mechanical (guides). Only user H/V offsets move ink.
 */
export function joshDrawRectMm(options: {
  widthMm: number;
  heightMm: number;
  hOffsetMm?: number;
  vOffsetMm?: number;
  alignment?: PrinterAlignment;
}): JoshDrawRectMm {
  const widthMm = Math.max(0.1, options.widthMm);
  const heightMm = Math.max(0.1, options.heightMm);
  const h = Number.isFinite(options.hOffsetMm) ? (options.hOffsetMm as number) : 0;
  const v = Number.isFinite(options.vOffsetMm) ? (options.vOffsetMm as number) : 0;
  return {
    xMm: roundMm(h),
    yMm: roundMm(Math.max(0, v)),
    drawWidthMm: roundMm(widthMm),
    drawHeightMm: roundMm(heightMm),
  };
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Same wait as JoshPrinterManager.labelPitchMs. A collated job pauses between
 * separate copies=1 sends. The native wait runs only when one call has copies > 1.
 * Feed length is height + max(gap, or 3 when gap is not positive, and 2), at
 * speed inches/sec when speed > 0 else 3, plus 250 ms, clamped to 400–3000.
 * Truncates the way Kotlin converts the sum to Long.
 */
export function joshLabelPitchMs(heightMm: number, gapMm: number, speed: number): number {
  const gapPart = gapMm > 0 ? gapMm : 3;
  const pitchMm = heightMm + Math.max(gapPart, 2);
  const ips = speed > 0 ? speed : 3;
  const mmPerSec = Math.max(ips * 25.4, 20);
  const raw = (pitchMm / mmPerSec) * 1000 + 250;
  return Math.min(3000, Math.max(400, Math.trunc(raw)));
}
