import test from 'node:test';
import assert from 'node:assert/strict';

import { createBulkLabelDocument, defaultBulkColumnMappings } from '../bulk-labels';
import { applySetupToSheet, normalizeHeader, snapshotSetup } from '../saved-setup';
import type { ExcelSheet } from '../../stores/data-store';

const first: ExcelSheet = {
  name: 'Sheet1',
  columns: ['Name', 'SKU', 'Price'],
  rows: [
    ['Pen', '111', '5'],
    ['Book', '222', '50'],
  ],
};

function savedFrom(sheet: ExcelSheet) {
  const doc = createBulkLabelDocument({
    name: 'First',
    widthMm: 50,
    heightMm: 30,
    excelFileId: 'f1',
    sheetIndex: 0,
    sheet,
    mappings: defaultBulkColumnMappings(sheet),
  });
  assert.ok(doc);
  const setup = snapshotSetup(doc, sheet, 'Stock tags');
  assert.ok(setup);
  return { doc, setup };
}

test('headers match ignoring case, spaces and punctuation', () => {
  assert.equal(normalizeHeader(' Unit  Price. '), normalizeHeader('unit_price'));
});

test('snapshot carries no sheet data or row edits', () => {
  const { setup } = savedFrom(first);
  assert.equal(setup.doc.bulk?.excelFileId, '');
  assert.equal(setup.doc.bulk?.rowCount, 0);
  assert.deepEqual(setup.columns, ['Name', 'SKU', 'Price']);
  assert.equal(setup.doc.elements.length, 0);
});

test('same headers in a different order land on the same boxes', () => {
  const { setup, doc } = savedFrom(first);
  const next: ExcelSheet = {
    name: 'Jan',
    columns: ['price', 'name', 'sku'],
    rows: [['9', 'Cup', '333']],
  };
  const applied = applySetupToSheet(setup, next, { id: 'f2', name: 'jan.xlsx' }, 0);
  assert.ok(applied);
  assert.deepEqual(applied.missing, []);
  assert.equal(applied.doc.bulk?.rowCount, 1);
  const nameSlot = applied.doc.bulk?.slots.find((s) => s.columnName === 'name');
  assert.equal(nameSlot?.columnIndex, 1);
  // The Name box keeps the geometry it had on the first label.
  const oldNameId = doc.bulk?.slots.find((s) => s.columnName === 'Name')?.id as string;
  assert.deepEqual(applied.doc.bulk?.sharedGeometry[nameSlot!.id], doc.bulk?.sharedGeometry[oldNameId]);
  assert.equal(applied.doc.elements.length, 3);
  assert.equal(applied.doc.widthMm, 50);
});

test('missing and extra columns are reported, matched ones still apply', () => {
  const { setup } = savedFrom(first);
  const next: ExcelSheet = { name: 'S', columns: ['Name', 'Colour'], rows: [['Cup', 'Red']] };
  const applied = applySetupToSheet(setup, next, { id: 'f3', name: 'x.xlsx' }, 0);
  assert.ok(applied);
  assert.deepEqual(applied.missing, ['SKU', 'Price']);
  assert.deepEqual(applied.extra, ['Colour']);
  assert.equal(applied.doc.bulk?.slots.length, 1);
});

test('no matching column gives nothing to apply', () => {
  const { setup } = savedFrom(first);
  const next: ExcelSheet = { name: 'S', columns: ['A', 'B'], rows: [['1', '2']] };
  assert.equal(applySetupToSheet(setup, next, { id: 'f4', name: 'x.xlsx' }, 0), null);
});
