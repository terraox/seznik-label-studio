import {
  bulkSlotId,
  projectBulkElements,
  type BulkLabelSet,
  type BulkSlot,
} from '@/lib/bulk-labels';
import { createUpsConfig, generateId, type LabelDocument } from '@/lib/label-document';
import type { ExcelSheet } from '@/stores/data-store';

/**
 * Saved setups: the design of an Excel label (size, paper, across, one box and style per column),
 * kept so the next sheet with the same headers comes up already laid out.
 *
 * The design is stored without any sheet data. Columns are matched by header NAME, never by
 * position, so a sheet with the columns in a different order still lines up.
 */
export type SavedSetup = {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;
  /** The label this was saved from, so the print prompt asks once per label. */
  sourceLabelId?: string;
  /** Header names of the included columns, for the list. */
  columns: string[];
  /** Name of the column that gave the copies count, if one did. */
  copiesColumnName: string | null;
  /** A bulk label document with no rows, no sheet and no editor state. */
  doc: LabelDocument;
};

/** Case, spacing and . _ - : ignored: "Qty." and "qty" are the same header. */
export function normalizeHeader(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_\-.:]+/g, '');
}

export function snapshotSetup(
  doc: LabelDocument,
  sheet: ExcelSheet | null,
  name: string,
): SavedSetup | null {
  const bulk = doc.bulk;
  if (!bulk || bulk.slots.length === 0) return null;
  const copy = JSON.parse(JSON.stringify(doc)) as LabelDocument;
  const cleanBulk: BulkLabelSet = {
    ...(copy.bulk as BulkLabelSet),
    excelFileId: '',
    sheetIndex: 0,
    rowCount: 0,
    rowGeometryOverrides: {},
    rowContentOverrides: {},
    rowCopiesOverrides: {},
    activeRowIndex: 0,
  };
  const copiesIndex = bulk.copiesColumnIndex;
  const now = Date.now();
  return {
    id: generateId('setup'),
    name: name.trim() || doc.name,
    createdAt: now,
    lastUsedAt: now,
    sourceLabelId: doc.id,
    columns: bulk.slots.map((s) => s.columnName),
    copiesColumnName: copiesIndex != null ? sheet?.columns[copiesIndex] ?? null : null,
    doc: {
      ...copy,
      elements: [],
      bulk: cleanBulk,
      ...(copy.ups ? { ups: { ...copy.ups, panels: [] } } : {}),
    },
  };
}

export type AppliedSetup = {
  doc: LabelDocument;
  /** Saved columns the sheet does not have. They are left off the label. */
  missing: string[];
  /** Sheet columns the setup has no place for. They are ignored. */
  extra: string[];
};

export function applySetupToSheet(
  setup: SavedSetup,
  sheet: ExcelSheet,
  file: { id: string; name: string },
  sheetIndex: number,
): AppliedSetup | null {
  const saved = setup.doc.bulk;
  if (!saved) return null;

  const indexByHeader = new Map<string, number>();
  sheet.columns.forEach((name, index) => {
    const key = normalizeHeader(name);
    if (key && !indexByHeader.has(key)) indexByHeader.set(key, index);
  });

  const slots: BulkSlot[] = [];
  const slotTemplates: BulkLabelSet['slotTemplates'] = {};
  const sharedGeometry: BulkLabelSet['sharedGeometry'] = {};
  const missing: string[] = [];
  const used = new Set<number>();

  for (const slot of saved.slots) {
    const index = indexByHeader.get(normalizeHeader(slot.columnName));
    const template = saved.slotTemplates[slot.id];
    const geometry = saved.sharedGeometry[slot.id];
    if (index === undefined || used.has(index) || !template || !geometry) {
      missing.push(slot.columnName);
      continue;
    }
    used.add(index);
    const id = bulkSlotId(index);
    slots.push({ ...slot, id, columnIndex: index, columnName: sheet.columns[index] ?? slot.columnName });
    slotTemplates[id] = { ...template, id };
    sharedGeometry[id] = geometry;
  }
  if (slots.length === 0) return null;

  const copiesKey = setup.copiesColumnName ? normalizeHeader(setup.copiesColumnName) : null;
  const copiesIndex = copiesKey ? indexByHeader.get(copiesKey) ?? null : null;

  const bulk: BulkLabelSet = {
    ...saved,
    excelFileId: file.id,
    sheetIndex,
    rowCount: sheet.rows.length,
    slots,
    slotTemplates,
    sharedGeometry,
    rowGeometryOverrides: {},
    rowContentOverrides: {},
    rowCopiesOverrides: {},
    activeRowIndex: 0,
    copiesColumnIndex: copiesIndex,
  };
  const elements = projectBulkElements(bulk, sheet, 0, {
    widthMm: setup.doc.widthMm,
    heightMm: setup.doc.heightMm,
  });
  const now = Date.now();
  const doc: LabelDocument = {
    ...setup.doc,
    id: generateId('label'),
    name: `${file.name} · ${sheet.rows.length} labels`,
    createdAt: now,
    updatedAt: now,
    bulk,
    elements,
  };
  if (setup.doc.ups) {
    const ups = createUpsConfig({
      columns: setup.doc.ups.columns,
      columnSpacingMm: setup.doc.ups.columnSpacingMm,
      batchEdit: setup.doc.ups.batchEdit,
      seedElements: elements,
    });
    ups.panels[0] = elements;
    doc.ups = ups;
  }

  const extra = sheet.columns.filter((_, index) => !used.has(index) && sheet.columns[index].trim() !== '');
  return { doc, missing, extra };
}
