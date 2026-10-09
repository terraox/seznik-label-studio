import assert from 'node:assert/strict';
import test from 'node:test';

import { emojiInkThresholdForOpaqueMean, emojiSampleIsInk } from '@/printing/raster/skia-emoji-print';

test('WePrint mix: light fills paper, dark features ink', () => {
  assert.equal(emojiSampleIsInk(255, 204, 0, 255), false, 'yellow face/fire core');
  assert.equal(emojiSampleIsInk(224, 172, 105, 255), false, 'skin');
  assert.equal(emojiSampleIsInk(255, 255, 255, 255), false);
  assert.equal(emojiSampleIsInk(250, 250, 250, 255), false);
  assert.equal(emojiSampleIsInk(255, 200, 0, 0), false, 'transparent');
  assert.equal(emojiSampleIsInk(0, 0, 0, 255), true, 'eyes / outline');
  assert.equal(emojiSampleIsInk(40, 40, 40, 255), true);
  assert.equal(emojiSampleIsInk(255, 0, 0, 255), true, 'dark red');
});

test('dark purple glyphs use a higher ink cut than yellow faces', () => {
  assert.ok(emojiInkThresholdForOpaqueMean(140) > 160);
  assert.equal(emojiInkThresholdForOpaqueMean(190), 160);
});
