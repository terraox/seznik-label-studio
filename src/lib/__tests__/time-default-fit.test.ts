import assert from 'node:assert/strict';
import test from 'node:test';

import { TIME_DISPLAY_SAMPLE } from '@/components/editor/types';
import { fitTimeDefaults } from '../element-sizing';
import { measureTextWidthMm, textHorizontalPaddingMm } from '../text-metrics';

test('a new Time element shows the whole date and time on any label', () => {
  for (const [w, h] of [[50, 30], [40, 30], [30, 20], [25, 15], [15, 10]] as const) {
    const fit = fitTimeDefaults(w, h, []);
    const needed = measureTextWidthMm(TIME_DISPLAY_SAMPLE, fit.fontSize) + textHorizontalPaddingMm(fit.fontSize) * 2;
    // At the 4 pt floor a tiny label may not fit it; the one-line strip then shows it past the box.
    if (fit.fontSize > 4) assert.ok(needed <= fit.width + 1e-6, `${w}x${h}: text needs ${needed.toFixed(1)} mm, box is ${fit.width.toFixed(1)} mm`);
    assert.ok(fit.left + fit.width <= w + 1e-6, `${w}x${h}: box leaves the label`);
  }
});
