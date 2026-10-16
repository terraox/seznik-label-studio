import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSerialLabelDocument,
  serialBarcodeEncodeMode,
  serialDocumentName,
  serialSheetFromLabels,
} from '@/lib/serial-label-document';
import {
  generateSerialLabelsFromSample,
  type LabelTemplate,
} from '@/lib/printer/SerialLabelEngine';

const template: LabelTemplate = {
  fields: {},
  textFieldKey: 'displayText',
  barcodeFieldKey: 'barcodeValue',
};

function labels() {
  return generateSerialLabelsFromSample('Desk1', template, {
    startNumber: 1,
    endNumber: 4,
    step: 1,
    barcodeSymbology: 'CODE128',
  });
}

test('serial sheet has one row per generated label', () => {
  const rows = serialSheetFromLabels(labels());
  assert.deepEqual(rows.columns, ['Text', 'Barcode']);
  assert.equal(rows.rows.length, 4);
  assert.equal(rows.rows[0][0], 'Desk1');
  assert.equal(rows.rows[3][0], 'Desk4');
});

test('serial canvas document is a bulk series with text and barcode', () => {
  const generated = labels();
  const doc = createSerialLabelDocument({
    labels: generated,
    excelFileId: 'xls_serial_test',
    widthMm: 50,
    heightMm: 30,
    barcodeSymbology: 'CODE128',
  });
  assert.ok(doc);
  assert.equal(doc!.bulk?.rowCount, 4);
  assert.equal(doc!.widthMm, 50);
  assert.equal(doc!.heightMm, 30);
  assert.equal(doc!.elements.length, 2);
  assert.ok(doc!.elements.some((el) => el.type === 'text' && el.text === 'Desk1'));
  assert.ok(doc!.elements.some((el) => el.type === 'barcode'));
  const barcode = doc!.elements.find((el) => el.type === 'barcode');
  assert.equal(barcode && barcode.type === 'barcode' ? barcode.encodeMode : '', 'CODE-128');
  assert.equal(serialDocumentName(generated), 'Serial Desk1 → Desk4');
});

test('barcode symbology maps onto editor encode modes', () => {
  assert.equal(serialBarcodeEncodeMode('CODE128'), 'CODE-128');
  assert.equal(serialBarcodeEncodeMode('CODE39'), 'CODE-39');
  assert.equal(serialBarcodeEncodeMode('EAN13'), 'EAN-13');
  assert.equal(serialBarcodeEncodeMode('UPCA'), 'UPC-A');
});
