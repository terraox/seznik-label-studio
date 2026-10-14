/**
 * Ninestar TD-404 TSPL limits shared by the Print screen, the JS fallback,
 * and the native module. DENSITY is 0–15. SPEED is an integer 1–7
 * (the module cannot send 1.5, and 8–12 are outside this head's TSPL range).
 */

export const TD404_DENSITY_MIN = 0;
export const TD404_DENSITY_MAX = 15;
export const TD404_DENSITY_DEFAULT = 10;

export const TD404_SPEED_MIN = 1;
export const TD404_SPEED_MAX = 7;
export const TD404_SPEED_DEFAULT = 3;

export const TD404_GAP_MIN_MM = 0;
export const TD404_GAP_MAX_MM = 20;

export type Td404Media = 'gap' | 'bline' | 'continuous';

export type Td404JobParams = {
  density: number;
  speed: number;
  /** Millimetres written on GAP or BLINE. Continuous is always 0. */
  gapMm: number;
  media: Td404Media;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampTd404Density(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return TD404_DENSITY_DEFAULT;
  return Math.min(TD404_DENSITY_MAX, Math.max(TD404_DENSITY_MIN, Math.round(value)));
}

export function clampTd404Speed(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return TD404_SPEED_DEFAULT;
  return Math.min(TD404_SPEED_MAX, Math.max(TD404_SPEED_MIN, Math.round(value)));
}

export function clampTd404GapMm(value: number | null | undefined, fallback = 2): number {
  const raw = value == null || !Number.isFinite(value) ? fallback : value;
  return round2(Math.min(TD404_GAP_MAX_MM, Math.max(TD404_GAP_MIN_MM, raw)));
}

/** Receipt is continuous. Black mark is BLINE. Every other stock is a gap label. */
export function td404MediaForPaperType(paperType: string | null | undefined): Td404Media {
  if (paperType === 'Receipt') return 'continuous';
  if (paperType === 'Black mark') return 'bline';
  return 'gap';
}

export function resolveTd404JobParams(input: {
  density?: number | null;
  speed?: number | null;
  gapMm?: number | null;
  paperType?: string | null;
}): Td404JobParams {
  const media = td404MediaForPaperType(input.paperType);
  const gapMm = media === 'continuous' ? 0 : clampTd404GapMm(input.gapMm);
  return {
    density: clampTd404Density(input.density),
    speed: clampTd404Speed(input.speed),
    gapMm,
    media,
  };
}
