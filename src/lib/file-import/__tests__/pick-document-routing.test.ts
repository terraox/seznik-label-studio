import assert from 'node:assert/strict';
import test from 'node:test';

import { DOCUMENT_PRESETS } from '@/lib/file-import/mime-presets';
import {
  LOCAL_INITIAL_FOLDER,
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

test('drive image preset keeps image mime filter without local hints', () => {
  const request = buildDocumentPickerRequest({ preset: 'image', source: 'drive' });
  assert.equal(request.localOnly, false);
  assert.equal(request.initialFolder, undefined);
  assert.deepEqual(request.type, DOCUMENT_PRESETS.image.mimeTypes);
});
