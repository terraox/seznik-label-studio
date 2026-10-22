import assert from 'node:assert/strict';
import test from 'node:test';

import { DOCUMENT_PRESETS } from '@/lib/file-import/mime-presets';
import { isLearnableMime, learn, sezlabelMimes, SEZLABEL_BASE_MIMES } from '../learned-mime-core';

test('the label picker list never includes pdf, spreadsheet, word, image, video, audio or wildcard types', () => {
  const NEVER = /pdf|spreadsheet|excel|msword|wordprocessing|presentation|^image\/|^video\/|^audio\/|^text\/|\*/i;
  for (const m of DOCUMENT_PRESETS.sezlabel.mimeTypes) assert.ok(!NEVER.test(m), m);
  assert.deepEqual(DOCUMENT_PRESETS.sezlabel.mimeTypes, SEZLABEL_BASE_MIMES);
});

test('unknown-type and zip types are listed, so a .sezlabel is selectable', () => {
  assert.ok(SEZLABEL_BASE_MIMES.includes('application/octet-stream'));
  assert.ok(SEZLABEL_BASE_MIMES.includes('application/zip'));
});

test('a type is learned from a real label file, but never a document or media type', () => {
  assert.deepEqual(learn([], 'application/x-sezlabel'), ['application/x-sezlabel']);
  assert.deepEqual(learn(['application/x-sezlabel'], 'application/x-sezlabel'), ['application/x-sezlabel']);
  assert.deepEqual(learn([], 'application/octet-stream'), [], 'already listed');
  for (const bad of ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'image/png', 'text/csv', '*/*', 'application/*', '', null, undefined, 'nonsense']) {
    assert.deepEqual(learn([], bad as string), [], String(bad));
    assert.equal(isLearnableMime(bad as string), false, String(bad));
  }
  const many = Array.from({ length: 20 }, (_, i) => `application/x-t${i}`).reduce((acc, m) => learn(acc, m), [] as string[]);
  assert.equal(many.length, 8);
});

test('stored types are cleaned before use', () => {
  const list = sezlabelMimes(['application/PDF', 'application/x-sezlabel; charset=x', 'image/png', 'junk']);
  assert.ok(list.includes('application/x-sezlabel'));
  assert.ok(!list.includes('application/pdf') && !list.includes('image/png'));
});
