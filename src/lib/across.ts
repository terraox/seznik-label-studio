import { borderBoxForCenterGap } from '@/lib/border-geometry';
import {
  composeUpsDocument,
  createLabelDocument,
  createUpsConfig,
  generateId,
  syncUpsActivePanel,
  type LabelDocument,
  type LabelElement,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';

/**
 * Labels across, two ways to work:
 * - separate: `doc.ups`, one panel (one label) edited at a time;
 * - together: `doc.across`, one wide canvas with every label on it, like a catalogue template.
 * Borders can likewise be one per label (separate) or one around the whole sheet (unified).
 */
export type AcrossMode = 'separate' | 'together';
export type BorderScope = 'separate' | 'unified';

export type AcrossLayout = {
  kind: 'ups' | 'together';
  columns: number;
  gapMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
  /** Distance from the left edge of one cell to the left edge of the next. */
  pitchMm: number;
};

export function acrossLayout(doc: LabelDocument): AcrossLayout | null {
  if (doc.ups && doc.ups.columns >= 2) {
    const gap = doc.ups.columnSpacingMm;
    return { kind: 'ups', columns: doc.ups.columns, gapMm: gap, cellWidthMm: doc.widthMm, cellHeightMm: doc.heightMm, pitchMm: doc.widthMm + gap };
  }
  if (doc.across && doc.across.columns >= 2) {
    const { columns, gapMm } = doc.across;
    const cell = (doc.widthMm - gapMm * (columns - 1)) / columns;
    return { kind: 'together', columns, gapMm, cellWidthMm: cell, cellHeightMm: doc.heightMm, pitchMm: cell + gapMm };
  }
  return null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Cell outlines for the canvas (not printed), the same idea as a catalogue template's SVG. */
/** Each cell is filled with the label colour, so the labels read as labels and the gaps between them as bare backing. */
export function acrossGuideSvg(layout: Pick<AcrossLayout, 'columns' | 'cellWidthMm' | 'cellHeightMm' | 'pitchMm'>, round: boolean, fill = 'none'): string {
  const w = r2(layout.pitchMm * (layout.columns - 1) + layout.cellWidthMm);
  const h = r2(layout.cellHeightMm);
  const stroke = 0.25;
  const cells = Array.from({ length: layout.columns }, (_, i) => {
    const x = r2(i * layout.pitchMm + stroke / 2);
    const cw = r2(layout.cellWidthMm - stroke);
    const ch = r2(h - stroke);
    return round
      ? `<ellipse cx="${r2(x + cw / 2)}" cy="${r2(h / 2)}" rx="${r2(cw / 2)}" ry="${r2(ch / 2)}" fill="${fill}" stroke="#000" stroke-width="${stroke}"/>`
      : `<rect x="${x}" y="${r2(stroke / 2)}" width="${cw}" height="${ch}" rx="1" fill="${fill}" stroke="#000" stroke-width="${stroke}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">${cells}</svg>`;
}

/** A blank label whose labels across share one canvas. */
export function createTogetherDocument(params: {
  name: string;
  cellWidthMm: number;
  cellHeightMm: number;
  columns: number;
  gapMm: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  circle?: boolean;
  seedElements?: LabelElement[];
}): LabelDocument {
  const cell = createLabelDocument({
    name: params.name,
    widthMm: params.cellWidthMm,
    heightMm: params.cellHeightMm,
    orientation: params.orientation,
    paperType: params.paperType,
    ...(params.circle ? { mediaShape: 'circle' as const } : {}),
    background: { type: 'color', color: '#FFFFFF' }, // theme-fixed: label paper colour (document data)
  });
  const ups = createUpsConfig({ columns: params.columns, columnSpacingMm: params.gapMm, batchEdit: true, seedElements: params.seedElements });
  const flat = composeUpsDocument({ ...cell, elements: ups.panels[0] ?? [], ups });
  const layout: AcrossLayout = {
    kind: 'together',
    columns: ups.columns,
    gapMm: params.gapMm,
    cellWidthMm: params.cellWidthMm,
    cellHeightMm: params.cellHeightMm,
    pitchMm: params.cellWidthMm + params.gapMm,
  };
  return {
    ...flat,
    // The sheet itself is bare; the canvas fills each cell with the label colour (see TemplateSvgOverlay).
    background: { type: 'none' },
    across: { columns: ups.columns, gapMm: params.gapMm, ...(params.circle ? { round: true } : {}) },
    templateCategory: 'Multi-UP',
    templateSvg: { xml: acrossGuideSvg(layout, Boolean(params.circle)) },
  };
}

const isBorder = (el: LabelElement) => el.type === 'border';

export type BorderStyleInput = { borderStyle: string; lineWidth: number; edgeGapMm: number };
type Box = { left: number; top: number; width: number; height: number };

function newBorder(style: BorderStyleInput, box: Box): LabelElement {
  return {
    id: generateId(),
    type: 'border',
    borderStyle: style.borderStyle,
    lineWidth: style.lineWidth,
    edgeGapMm: style.edgeGapMm,
    geometryVersion: 1,
    lockMovement: true,
    rotation: 0,
    needPrinting: true,
    drawingColorIndex: 0,
    ...box,
  } as unknown as LabelElement;
}

/** Keeps an existing border's own settings (colour, id) and only restyles it. */
function withBorder(elements: LabelElement[], style: BorderStyleInput, box: Box): LabelElement[] {
  const existing = elements.find(isBorder);
  if (!existing) return [...elements, newBorder(style, box)];
  return elements.map((el) => (el.id === existing.id ? ({ ...el, ...style, geometryVersion: 1, ...box } as LabelElement) : el));
}

/** Applies a chosen border to a labels-across document in the chosen scope. */
export function applyAcrossBorder(doc: LabelDocument, scope: BorderScope, style: BorderStyleInput): LabelDocument {
  const layout = acrossLayout(doc);
  if (!layout) return doc;

  if (layout.kind === 'ups') {
    const synced = syncUpsActivePanel(doc);
    const ups = synced.ups!;
    if (scope === 'unified') {
      const panels = ups.panels.map((panel) => panel.filter((el) => !isBorder(el)));
      return { ...synced, elements: panels[ups.activeIndex] ?? [], ups: { ...ups, panels, sheetBorder: style }, updatedAt: Date.now() };
    }
    const box = borderBoxForCenterGap(synced.widthMm, synced.heightMm, style.edgeGapMm, style.lineWidth);
    const panels = ups.panels.map((panel) => withBorder(panel, style, box));
    return { ...synced, elements: panels[ups.activeIndex] ?? [], ups: { ...ups, panels, sheetBorder: undefined }, updatedAt: Date.now() };
  }

  const rest = doc.elements.filter((el) => !isBorder(el));
  if (scope === 'unified') {
    const box = borderBoxForCenterGap(doc.widthMm, doc.heightMm, style.edgeGapMm, style.lineWidth);
    return { ...doc, elements: [...rest, newBorder(style, box)], updatedAt: Date.now() };
  }
  const box = borderBoxForCenterGap(layout.cellWidthMm, layout.cellHeightMm, style.edgeGapMm, style.lineWidth);
  const borders = Array.from({ length: layout.columns }, (_, i) => newBorder(style, { ...box, left: r2(box.left + i * layout.pitchMm) }));
  return { ...doc, elements: [...rest, ...borders], updatedAt: Date.now() };
}

/** Removes every border: on each label, on the whole sheet, or both. */
export function removeAcrossBorders(doc: LabelDocument): LabelDocument {
  const elements = doc.elements.filter((el) => !isBorder(el));
  if (!doc.ups) return { ...doc, elements, updatedAt: Date.now() };
  const synced = syncUpsActivePanel({ ...doc, elements });
  const panels = synced.ups!.panels.map((panel) => panel.filter((el) => !isBorder(el)));
  return { ...synced, ups: { ...synced.ups!, panels, sheetBorder: undefined }, updatedAt: Date.now() };
}

/** True when the document has a border of any kind (counting a whole-sheet border). */
export function hasAnyBorder(doc: LabelDocument): boolean {
  return doc.elements.some(isBorder) || Boolean(doc.ups?.sheetBorder) || Boolean(doc.ups?.panels.some((p) => p.some(isBorder)));
}
