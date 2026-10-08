import assert from 'node:assert/strict';
import test from 'node:test';

import { mapLocalPickedDocument } from '@/lib/file-import/pick-document-local-map';

test('local pick cancel maps to cancelled result', () => {
  assert.deepEqual(mapLocalPickedDocument(null, 'pdf'), { ok: false, reason: 'cancelled' });
});

test('local pick maps a valid pdf file', () => {
  const result = mapLocalPickedDocument(
    {
      name: 'invoice.pdf',
      uri: 'file:///cache/local-file-picker/invoice.pdf',
      size: 1200,
      mimeType: 'application/pdf',
    },
    'pdf',
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.name, 'invoice.pdf');
    assert.equal(result.extension, 'pdf');
  }
});

test('local pick rejects invalid extension for preset', () => {
  const result = mapLocalPickedDocument(
    {
      name: 'notes.txt',
      uri: 'file:///cache/local-file-picker/notes.txt',
      mimeType: 'text/plain',
    },
    'pdf',
  );
  assert.deepEqual(result, { ok: false, reason: 'invalid' });
});
