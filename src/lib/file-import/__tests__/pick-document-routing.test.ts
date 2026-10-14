import assert from 'node:assert/strict';
import test from 'node:test';

import { DOCUMENT_PRESETS } from '@/lib/file-import/mime-presets';
import {
  GOOGLE_SHEETS_MIME,
  LOCAL_INITIAL_FOLDER,
  androidSpreadsheetMimeTypes,
  buildDocumentPickerRequest,
} from '@/lib/file-import/pick-document-options';
import { shouldUseLocalFilePicker } from '@/lib/file-import/pick-document-routing';

test('android local documents use the native local-file-picker module', () => {
  assert.equal(shouldUseLocalFilePicker('local', 'android'), true);
});

test('android drive documents keep expo-document-picker with localOnly false', () => {
  assert.equal(shouldUseLocalFilePicker('drive', 'android'), false);
  const request = buildDocumentPickerRequest({ preset: 'pdf', source: 'drive' });
  assert.equal(request.localOnly, false);
  assert.equal(request.initialFolder, undefined);
});

test('ios local documents keep the system picker request', () => {
  assert.equal(shouldUseLocalFilePicker('local', 'ios'), false);
  const request = buildDocumentPickerRequest({ preset: 'pdf', source: 'local' });
  assert.equal(request.localOnly, true);
  assert.equal(request.initialFolder, LOCAL_INITIAL_FOLDER);
});

test('drive document pick passes localOnly false and no initial folder', () => {
  const request = buildDocumentPickerRequest({ preset: 'excel', source: 'drive' });
  assert.equal(request.localOnly, false);
  assert.equal(request.initialFolder, undefined);
  assert.deepEqual(request.type, DOCUMENT_PRESETS.excel.mimeTypes);
});

test('local picker request for ios still includes downloads hint', () => {
  const request = buildDocumentPickerRequest({ preset: 'any', source: 'local' });
  assert.equal(request.localOnly, true);
  assert.equal(request.initialFolder, 'downloads');
  assert.deepEqual(request.type, ['*/*']);
});

test('android drive excel requests Sheets without types that disable them', () => {
  const request = buildDocumentPickerRequest({
    preset: 'excel',
    source: 'drive',
    platform: 'android',
  });
  assert.deepEqual(request.type, androidSpreadsheetMimeTypes(DOCUMENT_PRESETS.excel.mimeTypes));
  assert.equal(request.type[0], GOOGLE_SHEETS_MIME);
  assert.equal(request.type.includes('application/octet-stream'), false);
  assert.equal(request.type.includes('public.spreadsheet'), false);
  assert.equal(request.type.includes('public.composite-content'), false);
  assert.equal(
    request.type.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    true,
  );
});

test('ios drive excel request stays the preset mime list', () => {
  const request = buildDocumentPickerRequest({
    preset: 'excel',
    source: 'drive',
    platform: 'ios',
  });
  assert.deepEqual(request.type, DOCUMENT_PRESETS.excel.mimeTypes);
  assert.equal(request.type.includes(GOOGLE_SHEETS_MIME), false);
});

test('android local excel does not add the Google Sheets mime', () => {
  const request = buildDocumentPickerRequest({
    preset: 'excel',
    source: 'local',
    platform: 'android',
  });
  assert.equal(request.type.includes(GOOGLE_SHEETS_MIME), false);
  assert.equal(request.localOnly, true);
});

test('drive image preset keeps image mime filter without local hints', () => {
  const request = buildDocumentPickerRequest({ preset: 'image', source: 'drive' });
  assert.equal(request.localOnly, false);
  assert.equal(request.initialFolder, undefined);
  assert.deepEqual(request.type, DOCUMENT_PRESETS.image.mimeTypes);
});

test('android drive excel list has no wildcard, octet-stream or non-MIME entries', () => {
  const request = buildDocumentPickerRequest({
    preset: 'excel',
    source: 'drive',
    platform: 'android',
  });
  for (const mime of request.type) {
    assert.ok(mime.includes('/'), `${mime} is not a MIME type`);
    assert.notEqual(mime, '*/*');
    assert.notEqual(mime, 'application/octet-stream');
    assert.equal(mime.startsWith('public.'), false);
  }
  assert.equal(request.type[0], GOOGLE_SHEETS_MIME);
  assert.equal(request.localOnly, false);
});

test('androidSpreadsheetMimeTypes strips bad entries, dedupes and keeps Sheets first', () => {
  const cleaned = androidSpreadsheetMimeTypes([
    '*/*',
    'application/octet-stream',
    'public.spreadsheet',
    'Text/CSV; charset=utf-8',
    'text/csv',
    GOOGLE_SHEETS_MIME,
  ]);
  assert.deepEqual(cleaned, [GOOGLE_SHEETS_MIME, 'text/csv']);
});

test('android local excel keeps the preset list and routes to the local picker', () => {
  const request = buildDocumentPickerRequest({
    preset: 'excel',
    source: 'local',
    platform: 'android',
  });
  assert.deepEqual(request.type, DOCUMENT_PRESETS.excel.mimeTypes);
  assert.equal(shouldUseLocalFilePicker('local', 'android'), true);
});
