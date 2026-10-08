import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANDROID_PUBLIC_SEZPRINT_ROOT,
  SEZPRINT_DIR_NAME,
  SEZPRINT_SUBDIRS,
  androidPublicSubdirUri,
  isInsideSezprint,
  safeImportFileName,
  sezprintSubdirUri,
} from '@/lib/user-files/paths';

test('sezprint paths stay under the app folder and never mention cache', () => {
  const doc = 'file:///data/user/0/com.sezprint.app/files/';
  const fonts = sezprintSubdirUri(doc, 'fonts');
  assert.equal(fonts, `${doc}${SEZPRINT_DIR_NAME}/fonts/`);
  assert.equal(fonts.includes('cache'), false);
  assert.deepEqual(SEZPRINT_SUBDIRS, [
    'clipart',
    'fonts',
    'labels',
    'excel',
    'pdf',
    'images',
    'print-history',
  ]);
});

test('android public mirror is Documents/sezprint', () => {
  assert.equal(androidPublicSubdirUri('clipart'), `${ANDROID_PUBLIC_SEZPRINT_ROOT}clipart/`);
  assert.match(ANDROID_PUBLIC_SEZPRINT_ROOT, /Documents\/sezprint\/$/);
});

test('already staged uris are recognized and file names stay safe', () => {
  const uri = 'file:///docs/sezprint/excel/xls_1.xlsx';
  assert.equal(isInsideSezprint(uri, 'excel'), true);
  assert.equal(isInsideSezprint(uri, 'pdf'), false);
  assert.equal(safeImportFileName('font_1', 'My Font.ttf', 'ttf'), 'font_1.ttf');
  assert.equal(safeImportFileName('id/../x', 'noext', 'png'), 'idx.png');
  assert.equal(safeImportFileName('id/../x', 'photo.jpg', 'png'), 'idx.jpg');
});
