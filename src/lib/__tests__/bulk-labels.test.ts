import test from 'node:test';
import assert from 'node:assert/strict';

import { barcodeModulesForMode } from '@/lib/barcode-code128';
import { DEFAULT_TEXT_FONT_PT } from '@/components/editor/types';
import {
  fitBarcodeDefaults,
  fitQrcodeDefaults,
} from '@/lib/element-sizing';
import {
  applyGeometryToAllLabels,
  applyGeometryToThisLabel,
  createBulkLabelDocument,
  geometryFromElements,
  guessBulkSlotKind,
  layoutBulkSlotsEvenly,
  projectBulkDocument,
  resizeBulkDocumentToSize,
  resolvedSlotContent,
  slotEncodePayload,
  syncBulkFromProjectedElements,
  type BulkColumnMapping,
  type BulkSlot,
} from '@/lib/bulk-labels';
import type { ExcelSheet } from '@/stores/data-store';

const sheet: ExcelSheet = {
  name: 'Sheet1',
  columns: ['Name', 'SKU', 'QR', 'Notes'],
  rows: [
    ['Widget', 'SKU-100', 'https://a.example/1', 'first'],
    ['Gadget', '', 'https://a.example/2', 'second'],
    ['Bolt', 'SKU-300', '', 'third'],
  ],
};

const mappings: BulkColumnMapping[] = [
  { columnIndex: 0, include: true, kind: 'text' },
  { columnIndex: 1, include: true, kind: 'barcode' },
  { columnIndex: 2, include: true, kind: 'qrcode' },
  { columnIndex: 3, include: false, kind: 'text' },
];

function created() {
  const doc = createBulkLabelDocument({
    name: 'products.xlsx · 3 labels',
    widthMm: 50,
    heightMm: 40,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings,
    barcodeEncodeMode: 'CODE-128',
    qrErrorLevel: 'M',
  });
  assert.ok(doc);
  return doc!;
}

function elementBottom(el: { top: number; height?: number }) {
  return el.top + (el.height ?? 0);
}

test('bulk import spaces slots evenly without overlap', () => {
  const doc = created();
  const sorted = [...doc.elements].sort((a, b) => a.top - b.top);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].top >= elementBottom(sorted[i - 1]) - 0.05);
  }
  const geos = doc.bulk!.slots.map((slot) => doc.bulk!.sharedGeometry[slot.id]);
  const laidOut = [...geos].sort((a, b) => a.top - b.top);
  if (laidOut.length >= 2) {
    const gaps = laidOut.slice(1).map((geo, index) => geo.top - (laidOut[index].top + laidOut[index].height));
    const first = gaps[0];
    for (const gap of gaps) {
      assert.ok(Math.abs(gap - first) < 0.2, `uneven gap: ${gap} vs ${first}`);
    }
  }
});

test('many Excel columns on a small label stay inside the stock', () => {
  const mappings: BulkColumnMapping[] = [
    { columnIndex: 0, include: true, kind: 'text' },
    { columnIndex: 1, include: true, kind: 'text' },
    { columnIndex: 2, include: true, kind: 'barcode' },
    { columnIndex: 3, include: true, kind: 'qrcode' },
  ];
  const doc = createBulkLabelDocument({
    name: 'dense.xlsx · 3 labels',
    widthMm: 40,
    heightMm: 30,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings,
  });
  assert.ok(doc);
  for (const el of doc!.elements) {
    assert.ok(el.left >= 0);
    assert.ok(el.top >= 0);
    assert.ok(el.left + el.width <= doc!.widthMm + 0.1);
    assert.ok(elementBottom(el) <= doc!.heightMm + 0.1);
  }
});

test('layoutBulkSlotsEvenly keeps equal gaps for mixed slot kinds', () => {
  const slots: BulkSlot[] = [
    { id: 'col:0', columnIndex: 0, columnName: 'A', kind: 'text' },
    { id: 'col:1', columnIndex: 1, columnName: 'B', kind: 'barcode' },
    { id: 'col:2', columnIndex: 2, columnName: 'C', kind: 'qrcode' },
  ];
  const drafts = [
    { width: 34, height: 5, fontSize: 8 },
    { width: 20, height: 8, fontSize: 6 },
    { width: 10, height: 10 },
  ];
  const geos = layoutBulkSlotsEvenly(slots, drafts, 40, 30);
  const gaps = geos.slice(1).map((geo, index) => geo.top - (geos[index].top + geos[index].height));
  assert.equal(gaps.length, 2);
  assert.ok(Math.abs(gaps[0] - gaps[1]) < 0.2);
});

test('Excel slots start at the same default sizes as adding tools on the canvas', () => {
  const widthMm = 50;
  const heightMm = 40;
  const textOnly = createBulkLabelDocument({
    name: 'text-defaults',
    widthMm,
    heightMm,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings: [{ columnIndex: 0, include: true, kind: 'text' }],
  });
  const barcodeOnly = createBulkLabelDocument({
    name: 'barcode-defaults',
    widthMm,
    heightMm,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings: [{ columnIndex: 1, include: true, kind: 'barcode' }],
  });
  const qrOnly = createBulkLabelDocument({
    name: 'qr-defaults',
    widthMm,
    heightMm,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings: [{ columnIndex: 2, include: true, kind: 'qrcode' }],
  });
  assert.ok(textOnly && barcodeOnly && qrOnly);

  const canvasBarcode = fitBarcodeDefaults(widthMm, heightMm, []);
  const canvasQr = fitQrcodeDefaults(widthMm, heightMm, []);

  const text = textOnly.elements.find((el) => el.type === 'text');
  const barcode = barcodeOnly.elements.find((el) => el.type === 'barcode');
  const qr = qrOnly.elements.find((el) => el.type === 'qrcode');
  assert.ok(text && barcode && qr);
  assert.equal(text.fontSize, DEFAULT_TEXT_FONT_PT);
  assert.equal(barcode.width, canvasBarcode.width);
  assert.equal(barcode.height, canvasBarcode.height);
  assert.equal(barcode.fontSize, canvasBarcode.fontSize);
  assert.equal(qr.width, canvasQr.width);
  assert.equal(qr.height, canvasQr.height);
});

test('Excel text slots keep the same layout width whatever the cell text', () => {
  const doc = created();
  const text = doc.elements.find((el) => el.id === 'col:0');
  assert.ok(text && text.type === 'text');
  assert.equal(text.text, 'Widget');
  const longer = projectBulkDocument(doc, {
    ...sheet,
    rows: [['Widget Extra Long Name', 'SKU-100', 'https://a.example/1', 'first']],
  }, 0);
  const longEl = longer.elements.find((el) => el.id === 'col:0');
  assert.ok(longEl && longEl.type === 'text');
  assert.equal(longEl.width, text.width);
  assert.equal(longEl.left, text.left);
});

test('included columns become typed elements; excluded columns are omitted', () => {
  const doc = created();
  assert.equal(doc.bulk?.slots.length, 3);
  assert.deepEqual(
    doc.elements.map((el) => el.type),
    ['text', 'barcode', 'qrcode'],
  );
  assert.deepEqual(
    doc.elements.map((el) => el.id),
    ['col:0', 'col:1', 'col:2'],
  );
});

test('two barcode columns each become their own encoded barcode slot', () => {
  const twoBc: BulkColumnMapping[] = [
    { columnIndex: 1, include: true, kind: 'barcode' },
    { columnIndex: 0, include: true, kind: 'barcode' },
  ];
  const doc = createBulkLabelDocument({
    name: 'bc',
    widthMm: 50,
    heightMm: 40,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings: twoBc,
  });
  assert.ok(doc);
  const barcodes = doc!.elements.filter((el) => el.type === 'barcode');
  assert.equal(barcodes.length, 2);
  assert.equal(barcodes[0].id, 'col:1');
  assert.equal(barcodes[1].id, 'col:0');
  assert.equal(barcodes[0].type === 'barcode' && barcodes[0].content, 'SKU-100');
  assert.equal(barcodes[1].type === 'barcode' && barcodes[1].content, 'Widget');
});

test('row projection fills cell values; empty barcode/QR are hidden and not encoder payloads', () => {
  const doc = created();
  const row1 = projectBulkDocument(doc, sheet, 1);
  const barcode = row1.elements.find((el) => el.id === 'col:1');
  assert.ok(barcode && barcode.type === 'barcode');
  assert.equal(barcode.content, '');
  assert.equal(barcode.visible, false);
  assert.equal(barcode.needPrinting, false);
  assert.equal(slotEncodePayload('barcode', barcode.content), null);

  const row2 = projectBulkDocument(doc, sheet, 2);
  const qr = row2.elements.find((el) => el.id === 'col:2');
  assert.ok(qr && qr.type === 'qrcode');
  assert.equal(qr.content, '');
  assert.equal(qr.visible, false);
  assert.equal(qr.needPrinting, false);
  assert.equal(slotEncodePayload('qrcode', qr.content), null);

  const payload = slotEncodePayload('barcode', '');
  assert.equal(payload, null);
  const modulesIfEncoded = barcodeModulesForMode('CODE-128', '');
  assert.ok(modulesIfEncoded, 'empty string currently encodes as 0123456789 — projection must not pass it');
});

test('empty barcode on one row does not hide the barcode on other rows', () => {
  const doc = created();
  const emptySku = projectBulkDocument(doc, sheet, 1);
  const hidden = emptySku.elements.find((el) => el.id === 'col:1');
  assert.equal(hidden?.visible, false);
  const filled = projectBulkDocument(emptySku, sheet, 0);
  const shown = filled.elements.find((el) => el.id === 'col:1');
  assert.ok(shown && shown.type === 'barcode');
  assert.equal(shown.content, 'SKU-100');
  assert.equal(shown.visible, true);
  assert.equal(shown.needPrinting, true);
  assert.equal(slotEncodePayload('barcode', shown.content), 'SKU-100');
});

test('text empty cell stays a blank visible slot', () => {
  const emptyName: ExcelSheet = {
    ...sheet,
    rows: [['', 'SKU-1', 'x', 'n']],
  };
  const doc = createBulkLabelDocument({
    name: 't',
    widthMm: 50,
    heightMm: 30,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet: emptyName,
    mappings,
  });
  const text = doc!.elements.find((el) => el.id === 'col:0');
  assert.ok(text && text.type === 'text');
  assert.equal(text.text, '');
  assert.notEqual(text.visible, false);
});

test('apply to this label leaves other rows on shared geometry', () => {
  const doc = created();
  const moved = applyGeometryToThisLabel(doc.bulk!, 0, {
    'col:0': { left: 8, top: 12, width: 20, height: 6 },
  });
  const row0 = resolved('col:0', moved, 0);
  const row1 = resolved('col:0', moved, 1);
  assert.equal(row0.left, 8);
  assert.equal(row0.top, 12);
  assert.equal(row1.left, doc.bulk!.sharedGeometry['col:0'].left);
  assert.equal(row1.top, doc.bulk!.sharedGeometry['col:0'].top);
});

test('apply to all is retroactive and clears per-row overrides for that slot', () => {
  const doc = created();
  let bulk = applyGeometryToThisLabel(doc.bulk!, 1, {
    'col:0': { left: 1, top: 1, width: 10, height: 4 },
  });
  bulk = applyGeometryToThisLabel(bulk, 2, {
    'col:0': { left: 2, top: 2, width: 11, height: 4 },
  });
  bulk = applyGeometryToAllLabels(bulk, {
    'col:0': { left: 15, top: 7, width: 22, height: 5 },
  });
  assert.equal(bulk.sharedGeometry['col:0'].left, 15);
  assert.equal(bulk.sharedGeometry['col:0'].top, 7);
  assert.equal(bulk.rowGeometryOverrides['1']?.['col:0'], undefined);
  assert.equal(bulk.rowGeometryOverrides['2']?.['col:0'], undefined);
  assert.equal(resolved('col:0', bulk, 0).left, 15);
  assert.equal(resolved('col:0', bulk, 1).left, 15);
  assert.equal(resolved('col:0', bulk, 2).left, 15);
});

test('geometryFromElements reads current slot boxes', () => {
  const doc = created();
  const geo = geometryFromElements(doc.elements, ['col:1']);
  assert.equal(geo['col:1'].width, doc.elements.find((el) => el.id === 'col:1')!.width);
});

test('content edits stay on the current row via overrides', () => {
  const doc = created();
  const edited = doc.elements.map((el) =>
    el.id === 'col:0' && el.type === 'text' ? { ...el, text: 'Renamed' } : el,
  );
  const bulk = syncBulkFromProjectedElements(doc.bulk!, sheet, edited);
  assert.equal(bulk.rowContentOverrides['0']?.['col:0'], 'Renamed');
  const row0 = projectBulkDocument({ ...doc, bulk }, sheet, 0);
  const row1 = projectBulkDocument({ ...doc, bulk }, sheet, 1);
  const t0 = row0.elements.find((el) => el.id === 'col:0');
  const name1 = row1.elements.find((el) => el.id === 'col:0');
  assert.ok(t0 && t0.type === 'text');
  assert.equal(t0.text, 'Renamed');
  assert.ok(name1 && name1.type === 'text');
  assert.equal(name1.text, 'Gadget');
});

test('keep-as-is resize updates shared geometry and row overrides; row switch keeps the new size', () => {
  const doc = created();
  const sharedBefore = doc.bulk!.sharedGeometry['col:0'];
  const bulk = applyGeometryToThisLabel(doc.bulk!, 1, {
    'col:0': { left: 8, top: 10, width: 18, height: 6 },
  });
  const resized = resizeBulkDocumentToSize({ ...doc, bulk }, 100, 80, 'keep', [
    { id: 'xls_test', sheets: [sheet] },
  ]);
  assert.equal(resized.widthMm, 100);
  assert.equal(resized.heightMm, 80);
  const shared = resized.bulk!.sharedGeometry['col:0'];
  assert.equal(shared.left, sharedBefore.left * 2);
  assert.equal(shared.top, sharedBefore.top * 2);
  assert.equal(shared.width, sharedBefore.width);
  assert.equal(shared.height, sharedBefore.height);
  const override = resized.bulk!.rowGeometryOverrides['1']['col:0'];
  assert.equal(override.left, 16);
  assert.equal(override.top, 20);
  assert.equal(override.width, 18);
  const row1 = projectBulkDocument(resized, sheet, 1);
  assert.equal(row1.widthMm, 100);
  const text = row1.elements.find((el) => el.id === 'col:0');
  assert.ok(text);
  assert.equal(text.left, 16);
  assert.equal(text.top, 20);
  assert.equal(text.width, 18);
});

test('scale resize writes new shared and override boxes so a row switch does not restore old millimetres', () => {
  const doc = created();
  const bulk = applyGeometryToThisLabel(doc.bulk!, 1, {
    'col:0': { left: 10, top: 8, width: 20, height: 6 },
  });
  const resized = resizeBulkDocumentToSize({ ...doc, bulk }, 100, 80, 'scale', [
    { id: 'xls_test', sheets: [sheet] },
  ]);
  assert.equal(resized.widthMm, 100);
  const shared = resized.bulk!.sharedGeometry['col:0'];
  assert.ok(shared.width > doc.bulk!.sharedGeometry['col:0'].width);
  const override = resized.bulk!.rowGeometryOverrides['1']['col:0'];
  assert.equal(override.left, 20);
  const row0 = projectBulkDocument(resized, sheet, 0);
  const row1 = projectBulkDocument(resized, sheet, 1);
  assert.equal(row0.widthMm, 100);
  assert.equal(row1.widthMm, 100);
  const t0 = row0.elements.find((el) => el.id === 'col:0');
  const t1 = row1.elements.find((el) => el.id === 'col:0');
  assert.ok(t0 && t1);
  assert.equal(t0.left, shared.left);
  assert.equal(t1.left, override.left);
});

function resolved(
  slotId: string,
  bulk: NonNullable<ReturnType<typeof created>['bulk']>,
  row: number,
) {
  return bulk.rowGeometryOverrides[String(row)]?.[slotId] ?? bulk.sharedGeometry[slotId];
}

test('guessBulkSlotKind maps common Excel headers', () => {
  assert.equal(guessBulkSlotKind('Name'), 'text');
  assert.equal(guessBulkSlotKind('Barcode'), 'barcode');
  assert.equal(guessBulkSlotKind('SKU'), 'barcode');
  assert.equal(guessBulkSlotKind('QR'), 'qrcode');
});

test('copies column index is stored and does not change projected elements', () => {
  const doc = createBulkLabelDocument({
    name: 'copies',
    widthMm: 50,
    heightMm: 40,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings,
    copiesColumnIndex: 3,
  });
  assert.equal(doc?.bulk?.copiesColumnIndex, 3);
  assert.ok(doc?.bulk?.slots.every((slot) => slot.columnIndex !== 3));
  const plain = created();
  const marked = projectBulkDocument(
    { ...plain, bulk: { ...plain.bulk!, copiesColumnIndex: 1 } },
    sheet,
    0,
  );
  const unmarked = projectBulkDocument(plain, sheet, 0);
  assert.deepEqual(marked.elements, unmarked.elements);

  const edited = projectBulkDocument(
    { ...plain, bulk: { ...plain.bulk!, rowCopiesOverrides: { '0': 4, '1': 9 } } },
    sheet,
    0,
  );
  assert.deepEqual(edited.elements, unmarked.elements);
  assert.deepEqual(edited.bulk?.rowCopiesOverrides, { '0': 4, '1': 9 });
});

test('display head prefixes text slot values', () => {
  const doc = createBulkLabelDocument({
    name: 'headed',
    widthMm: 50,
    heightMm: 40,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings,
    displayHead: true,
  });
  assert.ok(doc?.bulk);
  const slot = doc.bulk.slots.find((s) => s.kind === 'text');
  assert.ok(slot);
  assert.equal(resolvedSlotContent(doc.bulk, sheet, 0, slot), 'Name: Widget');
});

test('display head prefix is not saved as an edit or stacked on re-projection', () => {
  const doc = createBulkLabelDocument({
    name: 'headed',
    widthMm: 50,
    heightMm: 40,
    excelFileId: 'xls_test',
    sheetIndex: 0,
    sheet,
    mappings,
    displayHead: true,
  });
  assert.ok(doc?.bulk);
  const slot = doc.bulk.slots.find((s) => s.kind === 'text');
  assert.ok(slot);
  let current = doc;
  for (let i = 0; i < 3; i += 1) {
    const bulk = syncBulkFromProjectedElements(current.bulk!, sheet, current.elements);
    assert.deepEqual(bulk.rowContentOverrides, {});
    current = projectBulkDocument({ ...current, bulk }, sheet, 0);
  }
  assert.equal(resolvedSlotContent(current.bulk!, sheet, 0, slot), 'Name: Widget');

  // A real edit is stored without the prefix, and overrides damaged by older builds are healed.
  const edited = current.elements.map((el) =>
    el.id === slot.id && el.type === 'text' ? { ...el, text: 'Name: Gadget' } : el,
  );
  const saved = syncBulkFromProjectedElements(current.bulk!, sheet, edited);
  assert.equal(saved.rowContentOverrides['0'][slot.id], 'Gadget');
  const damaged = {
    ...saved,
    rowContentOverrides: { '0': { [slot.id]: 'Name: Name: Gadget' } },
  };
  assert.equal(resolvedSlotContent(damaged, sheet, 0, slot), 'Name: Gadget');
});
