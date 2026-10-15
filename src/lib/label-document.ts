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
import type { SignatureStroke } from '@/components/editor/signature-drawing-board';
import type { BorderStyleId } from '@/constants/border-library';
import type { MediaGeometry } from '@/lib/media-geometry';
import type { BulkLabelSet } from '@/lib/bulk-labels';
import type { LabelSettings } from '@/lib/label-settings';
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
export type PaperType = 'Receipt' | 'Label' | 'Cardstock' | 'Transparent' | 'Black mark';
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

/** Multi-up (2ups / 3ups / 4ups): edit one panel at a time; print tiles them in a row. */
export type LabelUpsConfig = {
  columns: number;
  columnSpacingMm: number;
  batchEdit: boolean;
  /** Panel currently mirrored in `elements` (0-based). */
  activeIndex: number;
  /** Per-column element lists. Length === columns. */
  panels: LabelElement[][];
};

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
  /** Present when this label is an N-up series edited panel-by-panel. */
  ups?: LabelUpsConfig;
  /** Excel bulk set: one saved label, many rows projected onto the canvas. */
  bulk?: BulkLabelSet;
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

export function parsePaperType(value: string | undefined): PaperType {
  if (
    value === 'Receipt' ||
    value === 'Label' ||
    value === 'Transparent' ||
    value === 'Black mark'
  ) {
    return value;
  }
  return 'Cardstock';
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
  const paperType = params.paperType ?? 'Cardstock';
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
    background:
      params.background ??
      (paperType === 'Transparent' ? { type: 'none' } : { type: 'color', color: '#FFFFFF' }),
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
  const columns = Math.max(2, Math.min(4, Math.round(params.columns)));
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

  return {
    ...synced,
    id: synced.id,
    name: synced.name,
    widthMm: Math.round(totalW * 100) / 100,
    heightMm: cellH,
    elements,
    background:
      synced.background?.type === 'color'
        ? synced.background
        : synced.paperType === 'Transparent'
          ? { type: 'none' }
          : { type: 'color', color: '#FFFFFF' },
    ups: undefined,
    updatedAt: Date.now(),
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
      if (autoHeight) return frame;
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
      if (autoHeight) return frame;
      if (stored > 0) return { width: element.width, height: stored };
      return frame;
    }
    case 'time': {
      const width = Math.max(0.5, element.width);
      if (typeof element.height === 'number' && element.height > 0) {
        return { width, height: element.height };
      }
      return {
        width,
        height: textBlockHeightMm(element.fontSize, 1),
      };
    }
    default:
      return { width: element.width, height: element.height };
  }
}
