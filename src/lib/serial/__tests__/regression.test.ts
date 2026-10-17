import assert from 'node:assert/strict';
import test from 'node:test';

import { rasterHash } from './raster-hash';
import { nonSerialFixture } from './regression-fixture';

// Recorded on the commit BEFORE any serial work. If this changes, a non-serial label now prints differently.
export const NON_SERIAL_RASTER_HASH = '0d7b737e';

test('non-serial label raster is byte-identical to the pre-serial baseline', () => {
  assert.equal(rasterHash(nonSerialFixture()), NON_SERIAL_RASTER_HASH);
});
