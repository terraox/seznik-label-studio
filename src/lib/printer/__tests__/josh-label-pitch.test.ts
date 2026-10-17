import assert from 'node:assert/strict';
import test from 'node:test';

import { joshLabelPitchMs } from '@/lib/printer/josh-print';

test('josh label pitch matches the native feed wait', () => {
  // 30 mm + 2 mm gap at 3 in/s, plus 250 ms slack, truncated, inside 400–3000.
  assert.equal(joshLabelPitchMs(30, 2, 3), 669);
});
