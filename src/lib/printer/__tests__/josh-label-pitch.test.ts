import assert from 'node:assert/strict';
import test from 'node:test';

import { joshLabelPitchMs } from '@/lib/printer/josh-print';

test('josh label pitch matches the native feed wait', () => {
  // 30 mm + 2 mm gap at 3 in/s, plus 250 ms slack, truncated, inside 400–3000.
  assert.equal(joshLabelPitchMs(30, 2, 3), 669);
});

test('label pitch is unchanged: gap 0 on Label still feeds a 3 mm stand-in gap', () => {
  // 30 + 3 mm at 3 in/s = 433 ms + 250.
  assert.equal(joshLabelPitchMs(30, 0, 3), 683);
  assert.equal(joshLabelPitchMs(30, -1, 3), 683);
  assert.equal(joshLabelPitchMs(30, 3, 3), 683);
});

test('receipt (gap 0, continuous) feeds the height alone and never waits zero or less', () => {
  // 30 mm at 3 in/s = 393 ms + 250.
  assert.equal(joshLabelPitchMs(30, 0, 3, true), 643);
  // Speed 0 or unknown falls back to 3 in/s.
  assert.equal(joshLabelPitchMs(30, 0, 0, true), 643);
  assert.equal(joshLabelPitchMs(30, 0, -1, true), 643);
  // Short, zero or bad heights hit the 400 ms floor.
  for (const height of [0, 5, -10, Number.NaN]) {
    assert.equal(joshLabelPitchMs(height, 0, 4, true), 400, String(height));
  }
  // Long receipts cap at 3000 ms.
  assert.equal(joshLabelPitchMs(500, 0, 1, true), 3000);
  for (const speed of [-1, 0, 1, 2, 3, 4]) {
    for (const height of [10, 30, 50, 100]) {
      assert.ok(joshLabelPitchMs(height, 0, speed, true) >= 400);
    }
  }
});
