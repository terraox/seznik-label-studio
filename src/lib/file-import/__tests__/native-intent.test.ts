import assert from 'node:assert/strict';
import test from 'node:test';

import { redirectSystemPath } from '@/app/+native-intent';
import { classifyIncomingFile } from '../classify-incoming-file';

test('a file sent with Open with lands on Home, not an unmatched route', () => {
  for (const path of [
    'content://com.android.providers.media.documents/document/document%3A1234',
    'content://com.google.android.apps.docs.storage/document/acc%3D1%3Bdoc%3Dencoded%3D9',
    'file:///storage/emulated/0/Download/orders.csv',
    '/content://media/external/file/55',
  ]) {
    assert.equal(redirectSystemPath({ path, initial: true }), '/', path);
    assert.equal(redirectSystemPath({ path, initial: false }), '/', path);
  }
});

test('the app own links are left alone', () => {
  assert.equal(redirectSystemPath({ path: 'sezprint://print?labelId=1', initial: true }), 'sezprint://print?labelId=1');
  assert.equal(redirectSystemPath({ path: '/edit', initial: false }), '/edit');
});

test('PDF, Excel and CSV files are all recognised once they are on Home', () => {
  assert.equal(classifyIncomingFile('invoice.pdf'), 'pdf');
  assert.equal(classifyIncomingFile('orders.xlsx'), 'excel');
  assert.equal(classifyIncomingFile('orders.xls'), 'excel');
  assert.equal(classifyIncomingFile('orders.csv'), 'excel');
  assert.equal(classifyIncomingFile('notes.txt'), null);
});
