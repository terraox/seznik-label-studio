import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  type QrErrorLevel,
} from '@/components/editor/types';
import {
  createLabelDocument,
  type LabelDocument,
  type LabelElement,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import {
  fitBarcodeDefaults,
  fitFontSizePt,
  fitQrcodeDefaults,
  fitTextBoxToContent,
  repositionDocumentToSize,
  scaleDocumentToSize,
  textBlockHeightMm,
} from '@/lib/element-sizing';
import type { ExcelSheet } from '@/stores/data-store';

export type BulkSlotKind = 'text' | 'barcode' | 'qrcode';

export type BulkColumnMapping = {
  columnIndex: number;
  include: boolean;
  kind: BulkSlotKind;
};

export type BulkSlot = {
  id: string;
  columnIndex: number;
  columnName: string;
  kind: BulkSlotKind;
};

export type BulkGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type BulkLabelSet = {
  excelFileId: string;
  sheetIndex: number;
  rowCount: number;
  slots: BulkSlot[];
  /** Shared style + type per slot. Geometry on these is the all-labels default. */
  slotTemplates: Record<string, LabelElement>;
  sharedGeometry: Record<string, BulkGeometry>;
  /** Sparse: rowIndex → slotId → geometry */
  rowGeometryOverrides: Record<string, Record<string, BulkGeometry>>;
  /** Sparse: rowIndex → slotId → edited cell string */
  rowContentOverrides: Record<string, Record<string, string>>;
  activeRowIndex: number;
  barcodeEncodeMode: string;
  qrErrorLevel: QrErrorLevel;
};

export function bulkSlotId(columnIndex: number): string {
  return `col:${columnIndex}`;
}

export function isBulkSlotId(id: string): boolean {
  return id.startsWith('col:');
}

export function resolveBulkSheet(
  files: { id: string; sheets: ExcelSheet[] }[],
  bulk: BulkLabelSet,
): ExcelSheet | null {
  const file = files.find((f) => f.id === bulk.excelFileId);
  if (!file) return null;
  return file.sheets[bulk.sheetIndex] ?? file.sheets[0] ?? null;
}

export function cellValue(sheet: ExcelSheet, rowIndex: number, columnIndex: number): string {
  return String(sheet.rows[rowIndex]?.[columnIndex] ?? '');
}

export function isEmptyCell(value: string): boolean {
  return value.trim() === '';
}

/**
 * Payload to pass to barcode/QR encoders. Empty cells return null so callers
 * never feed `barcodeModulesForMode` (`''` → placeholder `0123456789`) or
 * `generateQrMatrix` (`''` → invalid matrix).
 */
export function slotEncodePayload(kind: BulkSlotKind, value: string): string | null {
  if (kind === 'text') return value;
  if (isEmptyCell(value)) return null;
  return value;
}

export function geometryOfElement(el: Pick<LabelElement, 'left' | 'top' | 'width'> & { height?: number }): BulkGeometry {
  return {
    left: el.left,
    top: el.top,
    width: el.width,
    height: typeof el.height === 'number' ? el.height : 0,
  };
}

export function resolvedSlotGeometry(bulk: BulkLabelSet, rowIndex: number, slotId: string): BulkGeometry {
  const override = bulk.rowGeometryOverrides[String(rowIndex)]?.[slotId];
  if (override) return override;
  return bulk.sharedGeometry[slotId];
}

export function resolvedSlotContent(
  bulk: BulkLabelSet,
  sheet: ExcelSheet,
  rowIndex: number,
  slot: BulkSlot,
): string {
  const override = bulk.rowContentOverrides[String(rowIndex)]?.[slot.id];
  if (override !== undefined) return override;
  return cellValue(sheet, rowIndex, slot.columnIndex);
}

function applyGeometry<T extends LabelElement>(el: T, geo: BulkGeometry): T {
  const next = { ...el, left: geo.left, top: geo.top, width: geo.width } as T;
  if (el.type !== 'text' || typeof geo.height === 'number') {
    (next as { height: number }).height = geo.height;
  }
  return next;
}

function applyRowContent(el: LabelElement, kind: BulkSlotKind, value: string): LabelElement {
  if (kind === 'text' && el.type === 'text') {
    return { ...el, text: value, contentType: 'Manual', columnNameContent: '' };
  }
  if (kind === 'barcode' && el.type === 'barcode') {
    const empty = isEmptyCell(value);
    return {
      ...el,
      content: value,
      contentType: 'Manual',
      columnNameContent: '',
      visible: empty ? false : true,
      needPrinting: !empty,
    };
  }
  if (kind === 'qrcode' && el.type === 'qrcode') {
    const empty = isEmptyCell(value);
    return {
      ...el,
      content: value,
      contentType: 'Manual',
      columnNameContent: '',
      visible: empty ? false : true,
      needPrinting: !empty,
    };
  }
  return el;
}

const BULK_PAD_RATIO = 0.05;
const BULK_MIN_PAD_MM = 0.5;

function bulkPadMm(widthMm: number, heightMm: number): number {
  const ratioPad = Math.min(widthMm, heightMm) * BULK_PAD_RATIO;
  return Math.max(BULK_MIN_PAD_MM, Math.min(ratioPad, Math.min(widthMm, heightMm) * 0.12));
}

type BulkSlotDraft = {
  width: number;
  height: number;
  fontSize?: number;
};

/** Natural size for one Excel slot, budgeted for how many columns share the label. */
function draftBulkSlotSize(
  kind: BulkSlotKind,
  widthMm: number,
  heightMm: number,
  slotCount: number,
): BulkSlotDraft {
  const pad = bulkPadMm(widthMm, heightMm);
  const innerW = Math.max(4, widthMm - pad * 2);
  const innerH = Math.max(4, heightMm - pad * 2);
  const slotBudget = innerH / Math.max(1, slotCount);
  const minGap = Math.max(0.5, pad * 0.35);
  const targetH = Math.max(2, slotBudget - minGap);

  if (kind === 'text') {
    const fontSize = fitFontSizePt(widthMm, targetH, 1);
    const height = Math.min(textBlockHeightMm(fontSize, 1), targetH * 0.92);
    return { width: innerW, height: Math.max(2, height), fontSize };
  }

  if (kind === 'barcode') {
    const fit = fitBarcodeDefaults(widthMm, targetH, []);
    return {
      width: Math.min(fit.width, innerW),
      height: Math.max(2, Math.min(fit.height, targetH * 0.92)),
      fontSize: fit.fontSize,
    };
  }

  const fit = fitQrcodeDefaults(widthMm, targetH, []);
  const size = Math.max(2, Math.min(fit.width, fit.height, innerW, targetH * 0.92));
  return { width: size, height: size };
}

/**
 * Stack Excel slots top-to-bottom with equal gaps (including top/bottom margins).
 * Shrinks slot heights together when the label is too short to avoid overlap.
 */
export function layoutBulkSlotsEvenly(
  slots: BulkSlot[],
  drafts: BulkSlotDraft[],
  widthMm: number,
  heightMm: number,
): BulkGeometry[] {
  const n = slots.length;
  if (n === 0) return [];

  const pad = bulkPadMm(widthMm, heightMm);
  const innerW = Math.max(4, widthMm - pad * 2);
  const innerH = Math.max(4, heightMm - pad * 2);
  const minGap = Math.max(0.5, pad * 0.35);

  let heights = drafts.map((draft) => draft.height);
  const naturalTotal = heights.reduce((sum, height) => sum + height, 0);
  const minStack = naturalTotal + minGap * Math.max(0, n - 1);

  if (minStack > innerH && naturalTotal > 0) {
    const scale = (innerH - minGap * Math.max(0, n - 1)) / naturalTotal;
    heights = heights.map((height) => height * scale);
  }

  const totalH = heights.reduce((sum, height) => sum + height, 0);
  const gap = n === 1 ? Math.max(0, (innerH - totalH) / 2) : Math.max(minGap, (innerH - totalH) / (n + 1));

  const geos: BulkGeometry[] = [];
  let top = pad + gap;

  for (let i = 0; i < n; i++) {
    const kind = slots[i].kind;
    const draft = drafts[i];
    const height = heights[i];
    const scale = draft.height > 0 ? height / draft.height : 1;

    if (kind === 'text') {
      geos.push({ left: pad, top, width: innerW, height });
      top += height + gap;
      continue;
    }

    if (kind === 'qrcode') {
      const size = Math.max(2, Math.min(height, innerW));
      geos.push({ left: pad + (innerW - size) / 2, top, width: size, height: size });
      top += size + gap;
      continue;
    }

    const width = Math.max(2, Math.min(draft.width * scale, innerW));
    geos.push({ left: pad + (innerW - width) / 2, top, width, height });
    top += height + gap;
  }

  return geos;
}

function layoutSlotTemplates(
  slots: BulkSlot[],
  widthMm: number,
  heightMm: number,
  barcodeEncodeMode: string,
  qrErrorLevel: QrErrorLevel,
): { templates: Record<string, LabelElement>; geometry: Record<string, BulkGeometry> } {
  const templates: Record<string, LabelElement> = {};
  const geometry: Record<string, BulkGeometry> = {};
  const slotCount = slots.length;
  const drafts = slots.map((slot) => draftBulkSlotSize(slot.kind, widthMm, heightMm, slotCount));
  const positions = layoutBulkSlotsEvenly(slots, drafts, widthMm, heightMm);

  slots.forEach((slot, index) => {
    const draft = drafts[index];
    const geo = positions[index];
    const scale = draft.height > 0 ? geo.height / draft.height : 1;
    const fontSize =
      draft.fontSize != null
        ? Math.max(4, Math.round((draft.fontSize * scale) * 2) / 2)
        : undefined;

    if (slot.kind === 'text') {
      const el: LabelElement = {
        ...DEFAULT_ELEMENT_STATE,
        id: slot.id,
        type: 'text',
        text: '',
        contentType: 'Manual',
        left: geo.left,
        top: geo.top,
        width: geo.width,
        height: geo.height,
        fontSize: fontSize ?? draft.fontSize ?? DEFAULT_ELEMENT_STATE.fontSize,
        autoWrapping: 'Close',
      };
      templates[slot.id] = el;
      geometry[slot.id] = geometryOfElement(el);
      return;
    }

    if (slot.kind === 'barcode') {
      const el: LabelElement = {
        ...DEFAULT_BARCODE_STATE,
        id: slot.id,
        type: 'barcode',
        content: '',
        contentType: 'Manual',
        encodeMode: barcodeEncodeMode,
        left: geo.left,
        top: geo.top,
        width: geo.width,
        height: geo.height,
        fontSize: fontSize ?? draft.fontSize ?? DEFAULT_BARCODE_STATE.fontSize,
        visible: false,
        needPrinting: false,
      };
      templates[slot.id] = el;
      geometry[slot.id] = geometryOfElement(el);
      return;
    }

    const el: LabelElement = {
      ...DEFAULT_QRCODE_STATE,
      id: slot.id,
      type: 'qrcode',
      content: '',
      contentType: 'Manual',
      encodeMode: 'QRCode',
      errorLevel: qrErrorLevel,
      left: geo.left,
      top: geo.top,
      width: geo.width,
      height: geo.height,
      visible: false,
      needPrinting: false,
    };
    templates[slot.id] = el;
    geometry[slot.id] = geometryOfElement(el);
  });

  return { templates, geometry };
}

export function mappingsToSlots(sheet: ExcelSheet, mappings: BulkColumnMapping[]): BulkSlot[] {
  return mappings
    .filter((m) => m.include)
    .map((m) => ({
      id: bulkSlotId(m.columnIndex),
      columnIndex: m.columnIndex,
      columnName: sheet.columns[m.columnIndex] ?? `Column ${m.columnIndex + 1}`,
      kind: m.kind,
    }));
}

function fitProjectedText(
  el: LabelElement,
  canvas: { widthMm: number; heightMm: number },
): LabelElement {
  if (el.type !== 'text') return el;
  const fitted = fitTextBoxToContent(el, canvas);
  return { ...el, width: fitted.width, height: fitted.height };
}

export function projectBulkElements(
  bulk: BulkLabelSet,
  sheet: ExcelSheet,
  rowIndex: number,
  canvas?: { widthMm: number; heightMm: number },
): LabelElement[] {
  return bulk.slots.map((slot) => {
    const template = bulk.slotTemplates[slot.id];
    const geo = resolvedSlotGeometry(bulk, rowIndex, slot.id);
    const value = resolvedSlotContent(bulk, sheet, rowIndex, slot);
    const withGeo = applyGeometry(template, geo);
    const withContent = applyRowContent(withGeo, slot.kind, value);
    const hasRowBox = Boolean(bulk.rowGeometryOverrides[String(rowIndex)]?.[slot.id]);
    if (slot.kind === 'text' && withContent.type === 'text' && !hasRowBox) {
      return fitProjectedText(withContent, canvas ?? { widthMm: 200, heightMm: 200 });
    }
    return withContent;
  });
}

export function projectBulkDocument(
  doc: LabelDocument,
  sheet: ExcelSheet,
  rowIndex: number,
): LabelDocument {
  if (!doc.bulk) return doc;
  const clamped = Math.max(0, Math.min(rowIndex, Math.max(0, doc.bulk.rowCount - 1)));
  return {
    ...doc,
    elements: projectBulkElements(doc.bulk, sheet, clamped, {
      widthMm: doc.widthMm,
      heightMm: doc.heightMm,
    }),
    bulk: { ...doc.bulk, activeRowIndex: clamped },
  };
}

export function hydrateBulkDocument(
  doc: LabelDocument,
  files: { id: string; sheets: ExcelSheet[] }[],
): LabelDocument {
  if (!doc.bulk) return doc;
  const sheet = resolveBulkSheet(files, doc.bulk);
  if (!sheet) return doc;
  return projectBulkDocument(doc, sheet, doc.bulk.activeRowIndex);
}

export function createBulkLabelDocument(params: {
  name: string;
  widthMm: number;
  heightMm: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  excelFileId: string;
  sheetIndex: number;
  sheet: ExcelSheet;
  mappings: BulkColumnMapping[];
  barcodeEncodeMode?: string;
  qrErrorLevel?: QrErrorLevel;
}): LabelDocument | null {
  const slots = mappingsToSlots(params.sheet, params.mappings);
  if (slots.length === 0) return null;
  const barcodeEncodeMode = params.barcodeEncodeMode ?? 'CODE-128';
  const qrErrorLevel = params.qrErrorLevel ?? 'L';
  const laid = layoutSlotTemplates(
    slots,
    params.widthMm,
    params.heightMm,
    barcodeEncodeMode,
    qrErrorLevel,
  );
  const bulk: BulkLabelSet = {
    excelFileId: params.excelFileId,
    sheetIndex: params.sheetIndex,
    rowCount: params.sheet.rows.length,
    slots,
    slotTemplates: laid.templates,
    sharedGeometry: laid.geometry,
    rowGeometryOverrides: {},
    rowContentOverrides: {},
    activeRowIndex: 0,
    barcodeEncodeMode,
    qrErrorLevel,
  };
  const doc = createLabelDocument({
    name: params.name,
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    orientation: params.orientation,
    paperType: params.paperType,
    elements: projectBulkElements(bulk, params.sheet, 0, {
      widthMm: params.widthMm,
      heightMm: params.heightMm,
    }),
  });
  doc.bulk = bulk;
  return doc;
}

export function applyGeometryToAllLabels(
  bulk: BulkLabelSet,
  geometryBySlot: Record<string, BulkGeometry>,
): BulkLabelSet {
  const sharedGeometry = { ...bulk.sharedGeometry, ...geometryBySlot };
  const slotTemplates = { ...bulk.slotTemplates };
  for (const [slotId, geo] of Object.entries(geometryBySlot)) {
    const template = slotTemplates[slotId];
    if (template) slotTemplates[slotId] = applyGeometry(template, geo);
  }
  const rowGeometryOverrides: BulkLabelSet['rowGeometryOverrides'] = {};
  for (const [rowKey, rowMap] of Object.entries(bulk.rowGeometryOverrides)) {
    const nextRow: Record<string, BulkGeometry> = {};
    for (const [slotId, geo] of Object.entries(rowMap)) {
      if (!(slotId in geometryBySlot)) nextRow[slotId] = geo;
    }
    if (Object.keys(nextRow).length > 0) rowGeometryOverrides[rowKey] = nextRow;
  }
  return { ...bulk, sharedGeometry, slotTemplates, rowGeometryOverrides };
}

export function applyGeometryToThisLabel(
  bulk: BulkLabelSet,
  rowIndex: number,
  geometryBySlot: Record<string, BulkGeometry>,
): BulkLabelSet {
  const key = String(rowIndex);
  const row = { ...(bulk.rowGeometryOverrides[key] ?? {}), ...geometryBySlot };
  return {
    ...bulk,
    rowGeometryOverrides: { ...bulk.rowGeometryOverrides, [key]: row },
  };
}

export function geometryFromElements(elements: LabelElement[], slotIds: string[]): Record<string, BulkGeometry> {
  const out: Record<string, BulkGeometry> = {};
  for (const el of elements) {
    if (slotIds.includes(el.id)) out[el.id] = geometryOfElement(el);
  }
  return out;
}

export function slotGeometryChanged(
  before: LabelElement[],
  after: LabelElement[],
  slotIds: string[],
): boolean {
  const a = geometryFromElements(before, slotIds);
  const b = geometryFromElements(after, slotIds);
  for (const id of slotIds) {
    const prev = a[id];
    const next = b[id];
    if (!prev || !next) continue;
    if (
      prev.left !== next.left ||
      prev.top !== next.top ||
      prev.width !== next.width ||
      prev.height !== next.height
    ) {
      return true;
    }
  }
  return false;
}

/** Persist per-row content edits and copy non-geometry style onto shared templates. */
export function syncBulkFromProjectedElements(
  bulk: BulkLabelSet,
  sheet: ExcelSheet,
  elements: LabelElement[],
): BulkLabelSet {
  const rowKey = String(bulk.activeRowIndex);
  let contentOverrides = bulk.rowContentOverrides;
  const slotTemplates = { ...bulk.slotTemplates };

  for (const slot of bulk.slots) {
    const el = elements.find((item) => item.id === slot.id);
    if (!el) continue;
    const sheetValue = cellValue(sheet, bulk.activeRowIndex, slot.columnIndex);
    const live =
      el.type === 'text' ? el.text : 'content' in el && typeof el.content === 'string' ? el.content : '';
    const existingOverride = bulk.rowContentOverrides[rowKey]?.[slot.id];
    if (live !== sheetValue) {
      if (existingOverride !== live) {
        contentOverrides = {
          ...contentOverrides,
          [rowKey]: { ...(contentOverrides[rowKey] ?? {}), [slot.id]: live },
        };
      }
    } else if (existingOverride !== undefined) {
      const nextRow = { ...(contentOverrides[rowKey] ?? {}) };
      delete nextRow[slot.id];
      contentOverrides = { ...contentOverrides, [rowKey]: nextRow };
      if (Object.keys(nextRow).length === 0) {
        const { [rowKey]: _, ...rest } = contentOverrides;
        contentOverrides = rest;
      }
    }

    const template = slotTemplates[slot.id];
    if (template) {
      const geo = bulk.sharedGeometry[slot.id];
      const styled = applyGeometry({ ...el, id: slot.id } as LabelElement, geo);
      slotTemplates[slot.id] = applyRowContent(styled, slot.kind, '');
    }
  }

  return { ...bulk, rowContentOverrides: contentOverrides, slotTemplates };
}

export type BulkStockSizeMode = 'scale' | 'keep';

function mapGeometryRecord(
  record: Record<string, BulkGeometry>,
  mapGeo: (geo: BulkGeometry) => BulkGeometry,
): Record<string, BulkGeometry> {
  const next: Record<string, BulkGeometry> = {};
  for (const [id, geo] of Object.entries(record)) {
    next[id] = mapGeo(geo);
  }
  return next;
}

function scaleSlotElements(
  elements: LabelElement[],
  oldWidthMm: number,
  oldHeightMm: number,
  widthMm: number,
  heightMm: number,
): LabelElement[] {
  const dummy = createLabelDocument({
    name: 'bulk-resize',
    widthMm: oldWidthMm,
    heightMm: oldHeightMm,
    elements,
  });
  return scaleDocumentToSize(dummy, widthMm, heightMm).elements;
}

/**
 * One stock size for the whole Excel set. Updates shared geometry, templates,
 * and every row override, then reprojects the active row.
 */
export function resizeBulkDocumentToSize(
  doc: LabelDocument,
  widthMm: number,
  heightMm: number,
  mode: BulkStockSizeMode,
  files: { id: string; sheets: ExcelSheet[] }[],
): LabelDocument {
  if (!doc.bulk) {
    return mode === 'scale'
      ? scaleDocumentToSize(doc, widthMm, heightMm)
      : repositionDocumentToSize(doc, widthMm, heightMm);
  }

  const bulk = doc.bulk;
  const oldW = doc.widthMm;
  const oldH = doc.heightMm;
  const sx = widthMm / Math.max(oldW, 0.01);
  const sy = heightMm / Math.max(oldH, 0.01);

  let nextBulk: BulkLabelSet;

  if (mode === 'keep') {
    const mapGeo = (geo: BulkGeometry): BulkGeometry => ({
      left: geo.left * sx,
      top: geo.top * sy,
      width: geo.width,
      height: geo.height,
    });
    const sharedGeometry = mapGeometryRecord(bulk.sharedGeometry, mapGeo);
    const slotTemplates = { ...bulk.slotTemplates };
    for (const slot of bulk.slots) {
      const template = slotTemplates[slot.id];
      const geo = sharedGeometry[slot.id];
      if (template && geo) slotTemplates[slot.id] = applyGeometry(template, geo);
    }
    const rowGeometryOverrides: BulkLabelSet['rowGeometryOverrides'] = {};
    for (const [rowKey, rowMap] of Object.entries(bulk.rowGeometryOverrides)) {
      rowGeometryOverrides[rowKey] = mapGeometryRecord(rowMap, mapGeo);
    }
    nextBulk = { ...bulk, sharedGeometry, slotTemplates, rowGeometryOverrides };
  } else {
    const sharedEls = bulk.slots
      .map((slot) => {
        const template = bulk.slotTemplates[slot.id];
        const geo = bulk.sharedGeometry[slot.id];
        if (!template || !geo) return null;
        return applyGeometry(template, geo);
      })
      .filter((el): el is LabelElement => el != null);
    const scaledShared = scaleSlotElements(sharedEls, oldW, oldH, widthMm, heightMm);
    const slotTemplates: Record<string, LabelElement> = { ...bulk.slotTemplates };
    const sharedGeometry: Record<string, BulkGeometry> = { ...bulk.sharedGeometry };
    for (const el of scaledShared) {
      slotTemplates[el.id] = el;
      sharedGeometry[el.id] = geometryOfElement(el);
    }

    const rowGeometryOverrides: BulkLabelSet['rowGeometryOverrides'] = {};
    for (const [rowKey, rowMap] of Object.entries(bulk.rowGeometryOverrides)) {
      const nextRow: Record<string, BulkGeometry> = {};
      for (const [slotId, geo] of Object.entries(rowMap)) {
        const template = bulk.slotTemplates[slotId];
        if (!template) continue;
        const scaled = scaleSlotElements([applyGeometry(template, geo)], oldW, oldH, widthMm, heightMm);
        const el = scaled[0];
        if (el) nextRow[slotId] = geometryOfElement(el);
      }
      if (Object.keys(nextRow).length > 0) rowGeometryOverrides[rowKey] = nextRow;
    }
    nextBulk = { ...bulk, sharedGeometry, slotTemplates, rowGeometryOverrides };
  }

  return hydrateBulkDocument({ ...doc, widthMm, heightMm, bulk: nextBulk }, files);
}
