/**
 * DothanTech JOSH LPAPI job params. Never emit TSPL GAP/SPEED/DENSITY here —
 * those belong on TD-404 only. Gap length is millimetres; native converts to
 * 0.01 mm (mm × 100) before setPrintPageGapLength / GAP_LENGTH.
 */

import { JOSH_GAP_TYPE, joshGapTypeFromMedia } from '@/lib/printer/josh-print';
import { mediaForPaperType, paperTypeCommand } from '@/lib/printer/paper-type';

export const JOSH_GAP_MIN_MM = 0;
export const JOSH_GAP_MAX_MM = 20;
export const JOSH_GAP_DEFAULT_MM = 3;

/**
 * IDzPrinter.PrintParamValue in LPAPI-2026-01-08-R.jar:
 * MIN/MAX_PRINT_DARKNESS = 0/14, MIN/MAX_PRINT_SPEED = 0/4.
 * Speed 0 is the SDK floor and stalls the first label; the UI/job path uses 1–4.
 */
export const JOSH_DENSITY_MIN = 0;
export const JOSH_DENSITY_MAX = 14;
export const JOSH_SPEED_MIN = 1;
export const JOSH_SPEED_MAX = 4;

export type JoshMedia = 'gap' | 'bline' | 'continuous';

export type JoshJobParams = {
  /** LPAPI PRINT_DENSITY. −1 = omit (printer default). */
  density: number;
  /** LPAPI PRINT_SPEED. −1 = omit (printer default). */
  speed: number;
  /** Millimetres. Native multiplies by 100. Continuous is always 0. */
  gapMm: number;
  /** LPAPI GAP_TYPE: 0 receipt, 2 label, 3 black mark. */
  gapType: number;
  media: JoshMedia;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampJoshGapMm(value: number | null | undefined, fallback = JOSH_GAP_DEFAULT_MM): number {
  const raw = value == null || !Number.isFinite(value) ? fallback : value;
  return round2(Math.min(JOSH_GAP_MAX_MM, Math.max(JOSH_GAP_MIN_MM, raw)));
}

/** Receipt is continuous. Black mark is LPAPI type 3. Every other stock is gap paper (type 2). */
export function joshMediaForPaperType(paperType: string | null | undefined): JoshMedia {
  return mediaForPaperType(paperType);
}

function lpapiDensityOrDefault(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return -1;
  return Math.min(JOSH_DENSITY_MAX, Math.max(JOSH_DENSITY_MIN, Math.round(value)));
}

function lpapiSpeedOrDefault(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return -1;
  return Math.min(JOSH_SPEED_MAX, Math.max(JOSH_SPEED_MIN, Math.round(value)));
}

export function resolveJoshJobParams(input: {
  density?: number | null;
  speed?: number | null;
  gapMm?: number | null;
  paperType?: string | null;
  media?: JoshMedia | null;
}): JoshJobParams {
  const command = paperTypeCommand({
    printer: 'josh',
    paperType: input.paperType,
    gapMm: input.gapMm,
    media: input.media,
  });
  return {
    density: lpapiDensityOrDefault(input.density),
    speed: lpapiSpeedOrDefault(input.speed),
    gapMm: command.gapMm,
    gapType: command.joshGapType,
    media: command.media,
  };
}

export { JOSH_GAP_TYPE, joshGapTypeFromMedia };
