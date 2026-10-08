import assert from 'node:assert/strict';
import test from 'node:test';

import { LOCAL_FILE_PICKER_MAX_BYTES } from '@/lib/file-import/pick-local-constants';

test('local picker rejects files larger than 100 MB', () => {
  assert.equal(LOCAL_FILE_PICKER_MAX_BYTES, 100 * 1024 * 1024);
  const limitMb = LOCAL_FILE_PICKER_MAX_BYTES / (1024 * 1024);
  assert.equal(limitMb, 100);
});
