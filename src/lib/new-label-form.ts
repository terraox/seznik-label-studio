/**
 * New Label page — pure form logic (no React): parsing, limits, derived sizes,
 * shape switching and the route-parameter defaults. Kept free of UI imports so
 * it runs in node tests.
 */

import { JEWELRY_DIECUT } from '@/constants/jewelry-diecut';
import { MAX_LABEL_MM, MIN_LABEL_MM } from '@/lib/label-geometry';

export type Shape = 'rectangle' | 'circle';

export const MAX_COLUMNS = 6;
export const GAP_MIN_MM = -4;
export const GAP_MAX_MM = 20;
export const GAP_STEP_MM = 0.5;
export const NAME_MAX = 60;
export const DEFAULT_NAME = 'Default label';

/** Presets shown in the collapsible bar. Width x height in mm. */
export const NEW_LABEL_PRESETS = [
  { label: '50 × 25', width: 50, height: 25 },
  { label: '50 × 50', width: 50, height: 50 },
  { label: '50 × 30', width: 50, height: 30 },
  { label: '50 × 75', width: 50, height: 75 },
  { label: '50 × 15', width: 50, height: 15 },
  { label: '100 × 150', width: 100, height: 150 },
  { label: '100 × 100', width: 100, height: 100 },
  { label: '60 × 40', width: 60, height: 40 },
  { label: '40 × 30', width: 40, height: 30 },
] as const;

export type FormState = {
  shape: Shape;
  columns: number;
  /** Text as typed, mm. Parsed on read so half-typed values are never rewritten. */
  width: string;
  height: string;
  diameter: string;
  gap: string;
  name: string;
  batchEdit: boolean;
  /** Remembered across shape switches, never shown. */
  lastRect: { width: string; height: string };
  lastDiameter: string | null;
};

export type FormParams = {
  isClone?: string;
  isTwoUps?: string;
  isJewellery3Up?: string;
  cloneName?: string;
  cloneWidth?: string;
  cloneHeight?: string;
  defaultWidth?: string;
  defaultHeight?: string;
  isSingleCanvas?: string;
  importImageUri?: string;
  isJewelleryTag?: string;
};

export function fmtMm(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "50", "50.5", "50,5" give a number; empty, ".", letters or non-positive give null. */
export function parseMm(raw: string): number | null {
  const n = parseFloat(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** The gap may be zero or negative, so it has its own parser. */
export function parseGapMm(raw: string): number | null {
  const t = String(raw).replace(',', '.').trim();
  if (t === '' || t === '-' || t === '.') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Keep digits and one decimal separator while typing. */
export function sanitizeNumberText(raw: string): string {
  let out = '';
  let seenSep = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if ((ch === '.' || ch === ',') && !seenSep) {
      seenSep = true;
      out += ch;
    }
  }
  return out;
}

export function initialFormState(params: FormParams): FormState {
  const isImport = Boolean(params.importImageUri);
  // Custom Size sets isSingleCanvas but still gets Labels across; only image imports are single-label.
  const isTwoUps = !isImport && params.isTwoUps === 'true';
  const isJewellery3Up = !isImport && params.isJewellery3Up === 'true';
  const isClone = params.isClone === 'true';

  const name = isImport
    ? params.isJewelleryTag === 'true'
      ? 'Jewellery Image Label'
      : 'Imported Image Label'
    : isJewellery3Up
      ? 'Jewellery Label'
      : isClone
        ? params.cloneName
          ? `${params.cloneName} Copy`
          : 'Label Copy'
        : isTwoUps
          ? params.cloneName
            ? `${params.cloneName} · 2ups`
            : '2ups label'
          : DEFAULT_NAME;

  const w = params.defaultWidth
    ? parseFloat(params.defaultWidth)
    : isJewellery3Up
      ? JEWELRY_DIECUT.tagWidthMm
      : params.cloneWidth
        ? parseFloat(params.cloneWidth)
        : 50;
  const h = params.defaultHeight
    ? parseFloat(params.defaultHeight)
    : isJewellery3Up
      ? JEWELRY_DIECUT.tagHeightMm
      : params.cloneHeight
        ? parseFloat(params.cloneHeight)
        : 30;
  const width = fmtMm(Number.isFinite(w) ? w : 50);
  const height = fmtMm(Number.isFinite(h) ? h : 30);

  const columns = isImport ? 1 : isJewellery3Up ? JEWELRY_DIECUT.columns : isTwoUps ? 2 : 1;
  // Stick 2-up sits flush (0 mm); jewellery 3-up keeps its die-cut gap; otherwise 1 mm.
  const gap = isJewellery3Up ? JEWELRY_DIECUT.gapMm : isTwoUps ? 0 : 1;

  return {
    shape: 'rectangle',
    columns,
    width,
    height,
    diameter: width,
    gap: fmtMm(gap),
    name,
    batchEdit: false,
    lastRect: { width, height },
    lastDiameter: null,
  };
}

export function clampColumns(n: number): number {
  return Math.max(1, Math.min(MAX_COLUMNS, Math.round(n)));
}

export function stepGap(gapText: string, dir: 1 | -1): string {
  const cur = parseGapMm(gapText) ?? 0;
  const next = Math.round((cur + dir * GAP_STEP_MM) * 10) / 10;
  return fmtMm(Math.min(GAP_MAX_MM, Math.max(GAP_MIN_MM, next)));
}

/** Rectangle to circle takes the smaller side; back restores what was typed. */
export function switchShape(state: FormState, next: Shape): FormState {
  if (next === state.shape) return state;
  if (next === 'circle') {
    const w = parseMm(state.width);
    const h = parseMm(state.height);
    const fallback = w != null && h != null ? fmtMm(Math.min(w, h)) : state.diameter;
    return {
      ...state,
      shape: 'circle',
      lastRect: { width: state.width, height: state.height },
      diameter: state.lastDiameter ?? fallback,
    };
  }
  return {
    ...state,
    shape: 'rectangle',
    width: state.lastRect.width,
    height: state.lastRect.height,
    lastDiameter: state.diameter,
  };
}

export function cellSize(state: FormState): { w: number | null; h: number | null } {
  if (state.shape === 'circle') {
    const d = parseMm(state.diameter);
    return { w: d, h: d };
  }
  return { w: parseMm(state.width), h: parseMm(state.height) };
}

/** Same formula as `composeUpsDocument`, so the page and the print agree. */
export function totalWidthMm(cellW: number, columns: number, gap: number): number {
  return Math.max(cellW, Math.round((cellW * columns + gap * (columns - 1)) * 100) / 100);
}

export function widthWarning(totalMm: number, printerMaxMm: number | null): string | null {
  if (printerMaxMm == null || totalMm <= printerMaxMm + 0.001) return null;
  return `Total width ${fmtMm(totalMm)} mm is wider than your printer's ${fmtMm(printerMaxMm)} mm. It may be cut off.`;
}

/** Label of the matching preset ("50 × 30") or "Custom". Circles are always custom. */
export function presetLabelFor(shape: Shape, widthMm: number | null, heightMm: number | null): string {
  if (shape === 'circle' || widthMm == null || heightMm == null) return 'Custom';
  const found = NEW_LABEL_PRESETS.find(
    (p) => Math.abs(p.width - widthMm) < 0.15 && Math.abs(p.height - heightMm) < 0.15,
  );
  return found ? found.label : 'Custom';
}

export type FormErrors = {
  width?: string;
  height?: string;
  diameter?: string;
  gap?: string;
};

function sizeError(text: string): string | undefined {
  const n = parseMm(text);
  if (n == null) return 'Enter a number';
  if (n < MIN_LABEL_MM) return `Minimum is ${MIN_LABEL_MM} mm`;
  if (n > MAX_LABEL_MM) return `Maximum is ${MAX_LABEL_MM} mm`;
  return undefined;
}

export function validateForm(state: FormState): { errors: FormErrors; canCreate: boolean } {
  const errors: FormErrors = {};
  if (state.shape === 'circle') {
    const e = sizeError(state.diameter);
    if (e) errors.diameter = e;
  } else {
    const ew = sizeError(state.width);
    const eh = sizeError(state.height);
    if (ew) errors.width = ew;
    if (eh) errors.height = eh;
  }
  if (state.columns > 1) {
    const g = parseGapMm(state.gap);
    if (g == null || g < GAP_MIN_MM || g > GAP_MAX_MM) {
      errors.gap = `Gap must be between ${GAP_MIN_MM} and ${GAP_MAX_MM} mm`;
    }
  }
  return { errors, canCreate: Object.keys(errors).length === 0 };
}

export function resolvedName(name: string): string {
  const t = name.trim().slice(0, NAME_MAX);
  return t || DEFAULT_NAME;
}
