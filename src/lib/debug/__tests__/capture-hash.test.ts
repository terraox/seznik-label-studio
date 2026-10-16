import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { sha1Ascii } from '../capture-hash';

test('sha1Ascii matches node:crypto', () => {
  const samples = ['', 'abc', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'x'.repeat(1000)];
  for (const s of samples) {
    assert.equal(sha1Ascii(s), createHash('sha1').update(s, 'latin1').digest('hex'));
  }
});
