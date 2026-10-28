import {
  type ArcTextElementState,
  type BarcodeElementState,
  type DegreesElementState,
  type EditorElementState,
  type LineElementState,
  type QrcodeElementState,
  type LineSpacing,
  type Rotation,
  type ShapeElementState,
  type TableElementState,
  type TimeElementState,
} from '@/components/editor/types';
import type { SignatureStroke } from '@/components/editor/signature-preview';
import type { BorderStyleId } from '@/constants/border-library';
import type { MediaGeometry } from '@/lib/media-geometry';
import type { BulkLabelSet } from '@/lib/bulk-labels';
import type { SerialBatch } from '@/lib/serial/types';
import type { LabelSettings } from '@/lib/label-settings';
import { borderBoxForCenterGap } from '@/lib/border-geometry';
import { huggedTextFrameMm } from '@/lib/visible-text-layout';

export type TemplateBackground =
  | { type: 'none' }
  | { type: 'color'; color: string }
  | { type: 'image'; uri: string };

/**
 * Uploaded label photo, stretched behind the canvas.
 * A file name under `sezprint/images/`, never a URI and never base64.
 * It prints only when `needPrinting` is set.
 */
export type LabelReferenceImage = {
  fileName: string;
  widthPx: number;
  heightPx: number;
  rotation?: number;
  needPrinting?: boolean;
};

export type LabelOrientation = 0 | 90 | 180 | 270;
/**
 * Receipt is continuous paper. Label is gap paper. Transparent and Cardstock are Josh only
 * (hole and black-mark sensors); other printers print them as Label. Older values are read by readPaperType.
 */
export type PaperType = 'Receipt' | 'Label' | 'Transparent' | 'Cardstock';
/** Physical stock outline. Printers still receive a rectangular BITMAP; this clips preview/capture ink. */
export type MediaShape = 'rectangle' | 'roundedRectangle' | 'circle' | 'ellipse' | 'diecut';

export type ImageElementState = {
  uri: string;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  antiColor: boolean;
  flipH?: boolean;
  flipV?: boolean;
  contentFit?: 'fill' | 'contain' | 'cover';
  colorMode?: 'Original' | 'B & W' | 'Halftone';
  grayThreshold?: number;
  tile?: boolean;
  contentType?: 'Local Image' | 'Data Source';
  columnNameContent?: string;
  aspectRatioLocked?: boolean;
  originalAspect?: number;
  /** Full-resolution file for print. Canvas `uri` may be a downscaled working copy. */
  printUri?: string;
  workingWidthPx?: number;
  workingHeightPx?: number;
  /** Fit Label extract: print this image from printUri, not a canvas screenshot. */
  fitLabelSource?: boolean;
  /**
   * Print mode: 'solid' | 'floyd' | 'atkinson' | 'ordered'. All five fields below are additive:
   * when none is set the image prints exactly as before (colorMode / grayThreshold / antiColor).
   */
  imageMode?: 'solid' | 'floyd' | 'atkinson' | 'ordered';
  /** Solid cutoff, 1..254. */
  threshold?: number;
  /** -100..100 */
  brightness?: number;
  /** -100..100 */
  contrast?: number;
  invert?: boolean;
};

export type ClipartElementState = {
  clipartId: string;
  symbol?: string;
  glyph?: string;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
  tile?: boolean;
  colorMode?: 'Original' | 'B & W' | 'Halftone';
  grayThreshold?: number;
  /** Line-art thickness multiplier for vector stickers (0.5-3, default 1). */
  strokeScale?: number;
};

export type BorderElementState = {
  borderStyle: BorderStyleId;
  lineWidth: number;
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
  /** 1 = the rectangle is already the outer edge (2 mm inside the label). */
  geometryVersion?: 1;
  /** JOSH print: distance (mm) from each die-cut edge to the stroke center. Unset = default. */
  edgeGapMm?: number;
};

export type SignatureElementState = {
  strokes: SignatureStroke[];
  rotation: Rotation;
  left: number;
  top: number;
  width: number;
  height: number;
  lockMovement: boolean;
  needPrinting: boolean;
  drawingColorIndex: number;
  colorMode?: 'Original' | 'B & W' | 'Halftone';
  grayThreshold?: number;
};

export type ElementType =
  | 'text'
  | 'barcode'
  | 'qrcode'
  | 'line'
  | 'shape'
  | 'table'
  | 'time'
  | 'arctext'
  | 'degrees'
  | 'image'
  | 'clipart'
  | 'border'
  | 'signature';

type LayerMeta = {
  opacity?: number;
  zIndex?: number;
  /** Editor-only. Print still uses `needPrinting`. */
  visible?: boolean;
};

export type LabelElement = (
  | ({ id: string; type: 'text' } & EditorElementState)
  | ({ id: string; type: 'barcode' } & BarcodeElementState)
  | ({ id: string; type: 'qrcode' } & QrcodeElementState)
  | ({ id: string; type: 'line' } & LineElementState)
  | ({ id: string; type: 'shape' } & ShapeElementState)
  | ({ id: string; type: 'table' } & TableElementState)
  | ({ id: string; type: 'time' } & TimeElementState)
  | ({ id: string; type: 'arctext' } & ArcTextElementState)
  | ({ id: string; type: 'degrees' } & DegreesElementState)
  | ({ id: string; type: 'image' } & ImageElementState)
  | ({ id: string; type: 'clipart' } & ClipartElementState)
  | ({ id: string; type: 'border' } & BorderElementState)
  | ({ id: string; type: 'signature' } & SignatureElementState)
) & LayerMeta;

export type LabelElementOfType<T extends ElementType> = Extract<LabelElement, { type: T }>;

/**
 * A flattened multi-up sheet whose cells are circles or ellipses.
 * The sheet stays a rectangle so the row is not clipped into one shape.
 */
export type UpsTile = {
  shape: 'circle' | 'ellipse';
  columns: number;
  gapMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
  originXMm: number;
  originYMm: number;
};

/** Multi-up (2ups / 3ups / 4ups): edit one panel at a time; print tiles them in a row. */
export type LabelUpsConfig = {
  columns: number;
  columnSpacingMm: number;
  batchEdit: boolean;
  /** Panel currently mirrored in `elements` (0-based). */
  activeIndex: number;
  /** Per-column element lists. Length === columns. */
  panels: LabelElement[][];
  /** One border around the whole sheet (drawn at compose time) instead of one per label. */
  sheetBorder?: { borderStyle: string; lineWidth: number; edgeGapMm: number };
};

/** Labels across edited together on one wide canvas: where the cells are, so the editor can show them. */
export type LabelAcross = { columns: number; gapMm: number; /** Cells are circles / ellipses. */ round?: boolean };

/**
 * Canonical label. `widthMm` / `heightMm` and every element's `left` / `top` /
 * `width` / `height` are millimetres on the physical stock — never view pixels
 * and never a function of zoom/pan.
 */
export type LabelDocument = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  orientation: LabelOrientation;
  paperType: PaperType;
  /** Physical label outline. Absent means rectangle. */
  mediaShape?: MediaShape;
  /**
   * Structured stock (body + tail, etc.). Canvas `widthMm`/`heightMm` remain the
   * print bounding box. Overlay chrome reads this so the pad is not a fake rectangle.
   */
  mediaGeometry?: MediaGeometry;
  elements: LabelElement[];
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Bottom-most artboard fill. Absent / `none` means a transparent canvas. */
  background?: TemplateBackground;
  /** Industry template id used to create this label (for re-open consistency). */
  templatePreviewType?: string;
  templateCategory?: string;
  /** Outline of a catalogue SVG template, drawn on the canvas as the label shape. */
  templateSvg?: { xml: string };
  /** Present when this label is an N-up series edited panel-by-panel. */
  ups?: LabelUpsConfig;
  /** Present on a flattened N-up sheet whose cells keep a circle or ellipse outline. */
  upsTile?: UpsTile;
  /** Present when the labels across are edited together on one canvas (not panel by panel). */
  across?: LabelAcross;
  /** Excel bulk set: one saved label, many rows projected onto the canvas. */
  bulk?: BulkLabelSet;
  /** Serial batch size. The continue-from-last offset is deliberately NOT here (see serial-continue-store). */
  serialBatch?: SerialBatch;
  /** Per-label print/layout options (mirror mode, offsets, gap, etc.). */
  settings?: LabelSettings;
  /** Visual guide behind the editor canvas. Absent on older labels. */
  referenceImage?: LabelReferenceImage;
};

let idCounter = 0;

export function generateId(prefix = 'el') {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function parseOrientation(value: string | undefined): LabelOrientation {
  if (!value) return 0;
  const numeric = parseInt(value.replace('°', ''), 10);
  return numeric === 90 || numeric === 180 || numeric === 270 ? numeric : 0;
}

const PAPER_TYPE_VALUES: readonly PaperType[] = ['Receipt', 'Label', 'Transparent', 'Cardstock'];

/** Values saved before paper type changed. They open as Label. */
export const LEGACY_PAPER_TYPES = ['Black mark'] as const;

/**
 * The one place a stored, imported or route paper type is read. Receipt, Label, Transparent
 * and Cardstock stay. Everything else, including Black mark, missing and unknown, is Label.
 */
export function readPaperType(value: unknown): PaperType {
  return PAPER_TYPE_VALUES.includes(value as PaperType) ? (value as PaperType) : 'Label';
}

export function parsePaperType(value: string | undefined): PaperType {
  return readPaperType(value);
}

export function createLabelDocument(params: {
  name: string;
  widthMm: number;
  heightMm: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  mediaShape?: MediaShape;
  mediaGeometry?: MediaGeometry;
  elements?: LabelElement[];
  groupId?: string | null;
  background?: TemplateBackground;
}): LabelDocument {
  const now = Date.now();
  const paperType = readPaperType(params.paperType);
  return {
    id: generateId('label'),
    name: params.name,
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    orientation: params.orientation ?? 0,
    paperType,
    mediaShape: params.mediaShape,
    mediaGeometry: params.mediaGeometry,
    elements: params.elements ?? [],
    background: params.background ?? { type: 'color', color: '#FFFFFF' },
    groupId: params.groupId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneDocument(doc: LabelDocument): LabelDocument {
  return JSON.parse(JSON.stringify(doc)) as LabelDocument;
}

/** Deep-copy elements with fresh ids (for seeding sibling ups panels). */
export function cloneElementsFreshIds(elements: LabelElement[]): LabelElement[] {
  return (JSON.parse(JSON.stringify(elements)) as LabelElement[]).map((el) => ({
    ...el,
    id: generateId(),
  }));
}

export function createUpsConfig(params: {
  columns: number;
  columnSpacingMm?: number;
  batchEdit?: boolean;
  seedElements?: LabelElement[];
}): LabelUpsConfig {
  const columns = Math.max(2, Math.min(6, Math.round(params.columns)));
  const seed = params.seedElements ?? [];
  const panels = Array.from({ length: columns }, (_, i) =>
    i === 0 ? cloneElementsFreshIds(seed) : params.batchEdit ? cloneElementsFreshIds(seed) : [],
  );
  return {
    columns,
    // Stick 2-up stock is usually kiss-cut (0 mm gutter). Negative allowed at print compose.
    columnSpacingMm: params.columnSpacingMm ?? 0,
    batchEdit: params.batchEdit ?? false,
    activeIndex: 0,
    panels,
  };
}

/** Persist the live `elements` buffer into `ups.panels[activeIndex]`. */
export function syncUpsActivePanel(doc: LabelDocument): LabelDocument {
  if (!doc.ups) return doc;
  const panels = doc.ups.panels.map((panel, i) =>
    i === doc.ups!.activeIndex
      ? (JSON.parse(JSON.stringify(doc.elements)) as LabelElement[])
      : panel,
  );
  return { ...doc, ups: { ...doc.ups, panels } };
}

/** Switch the active ups panel; keeps single-template editing stable. */
export function switchUpsPanel(doc: LabelDocument, nextIndex: number): LabelDocument {
  if (!doc.ups) return doc;
  const clamped = Math.max(0, Math.min(doc.ups.columns - 1, nextIndex));
  if (clamped === doc.ups.activeIndex) return doc;
  const synced = syncUpsActivePanel(doc);
  const panels = synced.ups!.panels;
  const elements = JSON.parse(JSON.stringify(panels[clamped] ?? [])) as LabelElement[];
  return {
    ...synced,
    elements,
    ups: { ...synced.ups!, activeIndex: clamped },
  };
}

/**
 * When batch edit is on, mirror the active panel onto every column
 * (fresh ids per panel so selections stay isolated).
 */
export function applyUpsBatchMirror(doc: LabelDocument): LabelDocument {
  if (!doc.ups?.batchEdit) return doc;
  const synced = syncUpsActivePanel(doc);
  const source = synced.ups!.panels[synced.ups!.activeIndex] ?? [];
  const panels = synced.ups!.panels.map((_, i) =>
    i === synced.ups!.activeIndex
      ? (JSON.parse(JSON.stringify(source)) as LabelElement[])
      : cloneElementsFreshIds(source),
  );
  return { ...synced, ups: { ...synced.ups!, panels } };
}

/**
 * One N-up panel as a normal label at the cell size.
 * Print sends this document once per column. The stored border inset stays;
 * column spacing is not added into the width.
 */
export function upsPanelDocument(doc: LabelDocument, index: number): LabelDocument {
  if (!doc.ups || doc.ups.columns < 2) return doc;
  const synced = syncUpsActivePanel(doc);
  const columns = synced.ups!.columns;
  const clamped = Math.max(0, Math.min(columns - 1, Math.round(index)));
  const elements = JSON.parse(JSON.stringify(synced.ups!.panels[clamped] ?? [])) as LabelElement[];
  return {
    ...synced,
    elements,
    ups: undefined,
    updatedAt: Date.now(),
  };
}

/** Flatten N-up panels into one print-ready document (horizontal tile). */
export function composeUpsDocument(doc: LabelDocument): LabelDocument {
  if (!doc.ups || doc.ups.columns < 2) return doc;
  const synced = syncUpsActivePanel(doc);
  const { columns, columnSpacingMm, panels } = synced.ups!;
  // Allow negative gutter (stick calibration); keep total width at least one cell.
  const gap = columnSpacingMm;
  const cellW = synced.widthMm;
  const cellH = synced.heightMm;
  const totalW = Math.max(
    cellW,
    Math.round((cellW * columns + gap * (columns - 1)) * 100) / 100,
  );
  const elements: LabelElement[] = [];

  for (let i = 0; i < columns; i += 1) {
    const ox = i * (cellW + gap);
    const panelDoc = { widthMm: cellW, heightMm: cellH };
    for (const raw of panels[i] ?? []) {
      // A border keeps the inset stored for this cell, then moves onto its side.
      // Rewriting it to the cell edge made the two sides share one frame.
      const el = raw.type === 'border' ? raw : clampPanelElement(raw, panelDoc);
      elements.push({
        ...JSON.parse(JSON.stringify(el)),
        id: generateId(),
        left: el.left + ox,
      } as LabelElement);
    }
  }

  const cellShape =
    synced.mediaShape === 'circle' || synced.mediaShape === 'ellipse' ? synced.mediaShape : null;

  const sheetBorder = synced.ups!.sheetBorder;
  if (sheetBorder) {
    const sheetW = Math.round(totalW * 100) / 100;
    const box = borderBoxForCenterGap(sheetW, cellH, sheetBorder.edgeGapMm, sheetBorder.lineWidth);
    elements.push({
      id: generateId(),
      type: 'border',
      borderStyle: sheetBorder.borderStyle,
      lineWidth: sheetBorder.lineWidth,
      edgeGapMm: sheetBorder.edgeGapMm,
      geometryVersion: 1,
      lockMovement: true,
      rotation: 0,
      needPrinting: true,
      drawingColorIndex: 0,
      ...box,
    } as unknown as LabelElement);
  }

  return {
    ...synced,
    id: synced.id,
    name: synced.name,
    widthMm: Math.round(totalW * 100) / 100,
    heightMm: cellH,
    elements,
    // Each cell keeps the circle. The sheet itself is the row, not one circle.
    mediaShape: cellShape ? undefined : synced.mediaShape,
    upsTile: cellShape
      ? {
          shape: cellShape,
          columns,
          gapMm: gap,
          cellWidthMm: cellW,
          cellHeightMm: cellH,
          originXMm: 0,
          originYMm: 0,
        }
      : undefined,
    background:
      synced.background?.type === 'color' ? synced.background : { type: 'color', color: '#FFFFFF' },
    ups: undefined,
    updatedAt: Date.now(),
  };
}

/** One cell of a flattened circle/ellipse multi-up sheet, at that cell's own size. */
export function upsTileCellDocument(doc: LabelDocument, index: number): LabelDocument | null {
  const tile = doc.upsTile;
  if (!tile) return null;
  const i = Math.max(0, Math.min(tile.columns - 1, Math.round(index)));
  const pitch = tile.cellWidthMm + tile.gapMm;
  const ox = tile.originXMm + i * pitch;
  const oy = tile.originYMm;
  const elements = doc.elements
    .filter((el) => {
      const center = el.left + el.width / 2;
      const col = Math.floor((center - tile.originXMm) / Math.max(pitch, 0.01));
      return Math.max(0, Math.min(tile.columns - 1, col)) === i;
    })
    .map((el) => ({ ...el, left: el.left - ox, top: el.top - oy }));
  return {
    ...doc,
    mediaShape: tile.shape,
    upsTile: undefined,
    widthMm: tile.cellWidthMm,
    heightMm: tile.cellHeightMm,
    elements,
  };
}

/** Keep one panel's elements inside its exact mm box (used before compose). */
function clampPanelElement(
  element: LabelElement,
  doc: { widthMm: number; heightMm: number },
): LabelElement {
  if (element.type === 'border') {
    return {
      ...element,
      left: 0,
      top: 0,
      width: doc.widthMm,
      height: doc.heightMm,
      rotation: 0 as const,
    };
  }
  const maxW = doc.widthMm;
  const maxH = doc.heightMm;
  const minW = element.type === 'line' ? 0.1 : 0.5;
  const minH = element.type === 'line' ? 0.1 : 0.5;
  const width = Math.min(Math.max(minW, element.width), maxW);
  const height =
    'height' in element && typeof element.height === 'number'
      ? Math.min(Math.max(minH, element.height), maxH)
      : 0;
  const left = Math.min(Math.max(0, element.left), Math.max(0, maxW - width));
  const top = Math.min(Math.max(0, element.top), Math.max(0, maxH - (height || minH)));
  if (element.type === 'line') {
    return { ...element, left, top, width };
  }
  if ('height' in element) {
    return { ...element, left, top, width, height } as LabelElement;
  }
  return { ...element, left, top, width };
}

export function ptToMm(pt: number) {
  return (pt * 25.4) / 72;
}

export function mmToPt(mm: number) {
  return (mm * 72) / 25.4;
}

export function textBlockHeightMm(fontSizePt: number, lines: number, lineSpacing: LineSpacing = '1.0') {
  const mult = lineSpacing === '1.5' ? 1.5 : lineSpacing === '2.0' ? 2.0 : lineSpacing === 'Custom' ? 1.75 : 1.0;
  return Math.max(2.4, ptToMm(fontSizePt) * 1.25 * mult * Math.max(1, lines));
}

/** Bounding box of an element in mm. Auto-height text grows to its lines; a fixed height stays put. */
export function elementSizeMm(element: LabelElement): { width: number; height: number } {
  switch (element.type) {
    case 'text': {
      const rawText =
        element.contentType === 'Data Source' && element.columnNameContent
          ? `{${element.columnNameContent}}`
          : element.text;
      const stored = typeof element.height === 'number' && element.height > 0 ? element.height : 0;
      const autoHeight = element.autoTextHeight !== false && element.autoWrapping !== 'Close';
      const frame = huggedTextFrameMm({
        text: rawText,
        fontSize: element.fontSize,
        storedWidth: element.width,
        autoWrapping: element.autoWrapping ?? 'Word',
        lineSpacing: element.lineSpacing ?? '1.0',
        charSpacing: element.charSpacing ?? 0,
        bold: element.bold ?? false,
        verticalDisplay: element.verticalDisplay ?? false,
        fontFamily: element.fontFamily,
      });
      // Stored height is a floor after a width drag: RN may wrap taller than Skia until
      // native lines are cached. Never shorter than the content frame.
      if (autoHeight) return { width: frame.width, height: Math.max(frame.height, stored) };
      if (stored > 0) return { width: element.width, height: stored };
      return frame;
    }
    case 'degrees': {
      const rawText =
        element.contentType === 'Data Source' && element.columnNameContent
          ? `{${element.columnNameContent}}`
          : element.content;
      const stored = typeof element.height === 'number' && element.height > 0 ? element.height : 0;
      const autoHeight = element.autoTextHeight !== false && element.autoWrapping !== 'Close';
      const frame = huggedTextFrameMm({
        text: rawText,
        fontSize: element.fontSize,
        storedWidth: element.width,
        autoWrapping: element.autoWrapping ?? 'Word',
        lineSpacing: element.lineSpacing ?? '1.0',
        charSpacing: element.charSpacing ?? 0,
        bold: element.bold ?? false,
        verticalDisplay: element.verticalDisplay ?? false,
        fontFamily: element.fontFamily,
      });
      if (autoHeight) return { width: frame.width, height: Math.max(frame.height, stored) };
      if (stored > 0) return { width: element.width, height: stored };
      return frame;
    }
    case 'time': {
      // One line at any width: height follows the font, never a stored box (there is no height handle).
      return {
        width: Math.max(0.5, element.width),
        height: textBlockHeightMm(element.fontSize, 1),
      };
    }
    default:
      return { width: element.width, height: element.height };
  }
}
