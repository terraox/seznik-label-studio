import assert from 'node:assert/strict';
import test from 'node:test';

import { rasterHash } from './raster-hash';
import type { LabelElement } from '@/lib/label-document';
import { defaultSerialConfig } from '@/lib/serial/legacy';
import { resolveDocumentForIndex } from '@/lib/serial/resolve-document';
import { nonSerialFixture } from './regression-fixture';

// Recorded on the commit BEFORE any serial work. If this changes, a non-serial label now prints differently.
export const NON_SERIAL_RASTER_HASH = '0d7b737e';

test('non-serial label raster is byte-identical to the pre-serial baseline', () => {
  assert.equal(rasterHash(nonSerialFixture()), NON_SERIAL_RASTER_HASH);
});

test('a serial text element prints exactly like a plain text element holding the same value', () => {
  const plain = nonSerialFixture();
  const serialDoc = {
    ...plain,
    elements: plain.elements.map((el) =>
      el.id === 't1'
        ? ({ ...el, text: 'x', contentType: 'Degrees', serial: defaultSerialConfig('Hello 12') } as unknown as LabelElement)
        : el,
    ),
  };
  // serial index 0 of "Hello 12" is "Hello 12", the same string the plain fixture holds
  const resolved = resolveDocumentForIndex(serialDoc, 0);
  assert.equal((resolved.elements.find((e) => e.id === 't1') as { text: string }).text, 'Hello 12');
  assert.equal(rasterHash(resolved), NON_SERIAL_RASTER_HASH);
  // and a non-serial document is returned untouched at any index
  assert.equal(resolveDocumentForIndex(plain, 7), plain);
  assert.equal(rasterHash(resolveDocumentForIndex(plain, 7)), NON_SERIAL_RASTER_HASH);
});
