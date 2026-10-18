import type { LabelDocument } from '@/lib/label-document';
import { createLabelDocument } from '@/lib/label-document';
import {
  GRID_SPACING_MAX_MM,
  GRID_SPACING_MIN_MM,
  clampGridSpacingMm,
} from '@/lib/editor/canvas-grid';
import { defaultLabelSettings, resolveLabelSettings } from '@/lib/label-settings';
import { printLabelDocumentMainPipeline } from '@/lib/printer/main-pipeline-print';
import { getPrinterManager } from '@/lib/printer/printer-manager';

export type DiagnosticGridSizePreset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
};

export const DIAGNOSTIC_GRID_SIZE_PRESETS: DiagnosticGridSizePreset[] = [
  { id: '50x15', label: '50 × 15 mm', widthMm: 50, heightMm: 15 },
  { id: '25x25', label: '25 × 25 mm', widthMm: 25, heightMm: 25 },
  { id: '50x25', label: '50 × 25 mm', widthMm: 50, heightMm: 25 },
  { id: '50x30', label: '50 × 30 mm', widthMm: 50, heightMm: 30 },
  { id: '40x30', label: '40 × 30 mm', widthMm: 40, heightMm: 30 },
  { id: 'custom', label: 'Custom (mm)', widthMm: 50, heightMm: 15 },
];

export function parseLabelSizeMm(
  widthText: string,
  heightText: string,
): { widthMm: number; heightMm: number } | { error: string } {
  const widthMm = Number.parseFloat(widthText.replace(',', '.'));
  const heightMm = Number.parseFloat(heightText.replace(',', '.'));
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) {
    return { error: 'Enter width and height in millimetres.' };
  }
  if (widthMm < 10 || widthMm > 120 || heightMm < 8 || heightMm > 200) {
    return { error: 'Width must be 10–120 mm and height 8–200 mm.' };
  }
  return { widthMm, heightMm };
}

/** Suggested spacing when opening grid test (user can override in diagnostics UI). */
export function suggestedDiagnosticGridSpacingMm(widthMm: number, heightMm: number): number {
  const minSide = Math.min(widthMm, heightMm);
  if (minSide <= 18) return clampGridSpacingMm(2.5);
  return clampGridSpacingMm(5);
}

export function parseGridSpacingMm(
  text: string,
): { spacingMm: number } | { error: string } {
  const spacingMm = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(spacingMm)) {
    return { error: 'Enter grid spacing in millimetres.' };
  }
  if (spacingMm < GRID_SPACING_MIN_MM || spacingMm > GRID_SPACING_MAX_MM) {
    return { error: `Grid spacing must be ${GRID_SPACING_MIN_MM}–${GRID_SPACING_MAX_MM} mm.` };
  }
  return { spacingMm: clampGridSpacingMm(spacingMm) };
}

/** Gap between labels the tests tell the printer about; starts at the configured label gap. */
export function defaultDiagnosticGapMm(): number {
  return defaultLabelSettings().gapLengthMm;
}

export const DIAGNOSTIC_GAP_PRESETS_MM = [0, 2, 2.5, 3, 4];

export function parseGapMm(text: string): { gapMm: number } | { error: string } {
  const gapMm = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(gapMm)) {
    return { error: 'Enter the gap between labels in millimetres.' };
  }
  if (gapMm < 0 || gapMm > 20) {
    return { error: 'Gap must be 0–20 mm.' };
  }
  return { gapMm: Math.round(gapMm * 10) / 10 };
}

export type DiagnosticPatternKind = 'grid' | 'ruler';

export function buildDiagnosticPatternDocument(
  widthMm: number,
  heightMm: number,
  kind: DiagnosticPatternKind,
  gridSpacingMm: number,
  gapMm: number = defaultDiagnosticGapMm(),
): LabelDocument {
  const spacingMm = clampGridSpacingMm(gridSpacingMm);
  const doc = createLabelDocument({
    name: kind === 'grid' ? `Grid ${widthMm}×${heightMm}` : `Scale ${widthMm}×${heightMm}`,
    widthMm,
    heightMm,
    paperType: 'Label',
    elements: [],
  });
  return {
    ...doc,
    settings: {
      ...resolveLabelSettings(doc),
      gapLengthMm: gapMm,
      printGrid: kind === 'grid',
      printGridSpacingMm: spacingMm,
      printRuler: kind === 'ruler',
    },
  };
}

async function printDiagnosticPattern(
  widthMm: number,
  heightMm: number,
  kind: DiagnosticPatternKind,
  gridSpacingMm: number,
  gapMm: number,
): Promise<void> {
  const manager = getPrinterManager();
  if (
      !manager.isLabelX &&
      !manager.isDev &&
      !manager.isTez &&
      !manager.isJosh &&
      !manager.usesTd404CommandSet
    ) {
    throw new Error('Grid and ruler tests need a native label printer (TD-404, Josh, Tez, Dev, or Label X).');
  }
  const doc = buildDiagnosticPatternDocument(widthMm, heightMm, kind, gridSpacingMm, gapMm);
  await printLabelDocumentMainPipeline(doc, { gapMm });
}

/** Interior mm grid only (no border, no edge ruler). */
export async function printDiagnosticGridTest(
  widthMm: number,
  heightMm: number,
  gridSpacingMm: number,
  gapMm: number,
): Promise<void> {
  await printDiagnosticPattern(widthMm, heightMm, 'grid', gridSpacingMm, gapMm);
}

/** Edge mm scale ruler only (no border, no interior grid). */
export async function printDiagnosticRulerTest(
  widthMm: number,
  heightMm: number,
  gapMm: number,
): Promise<void> {
  await printDiagnosticPattern(widthMm, heightMm, 'ruler', clampGridSpacingMm(5), gapMm);
}
