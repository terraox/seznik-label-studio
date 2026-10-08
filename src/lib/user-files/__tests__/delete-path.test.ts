import assert from 'node:assert/strict';
import test from 'node:test';

import { fileNameFromUri, isInsideSezprint } from '@/lib/user-files/paths';

test('delete targets keep the file name and ignore missing-looking uris', () => {
  assert.equal(fileNameFromUri('file:///docs/sezprint/clipart/svg_1.svg?x=1'), 'svg_1.svg');
  assert.equal(fileNameFromUri(''), '');
  assert.equal(isInsideSezprint('file:///cache/tmp.svg', 'clipart'), false);
});
