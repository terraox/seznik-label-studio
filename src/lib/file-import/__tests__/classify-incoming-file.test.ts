import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyIncomingFile } from '@/lib/file-import/classify-incoming-file';

test('spreadsheets, PDFs and label files are told apart by name', () => {
  assert.equal(classifyIncomingFile('stock.xlsx'), 'excel');
  assert.equal(classifyIncomingFile('stock.XLS'), 'excel');
  assert.equal(classifyIncomingFile('items.csv'), 'excel');
  assert.equal(classifyIncomingFile('invoice.pdf'), 'pdf');
  assert.equal(classifyIncomingFile('shelf.seznik'), 'label');
  assert.equal(classifyIncomingFile('shelf.seznik.zip'), 'label');
  assert.equal(classifyIncomingFile('old.sezlabel'), 'label');
});

test('other files are not opened', () => {
  assert.equal(classifyIncomingFile('photo.jpg'), null);
  assert.equal(classifyIncomingFile('archive.zip'), null);
  assert.equal(classifyIncomingFile('notes'), null);
});
