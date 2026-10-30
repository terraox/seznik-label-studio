import test from 'node:test';
import assert from 'node:assert/strict';

import { RESIZE_MIN_PROPORTIONAL_MM, resizePolicyFor } from '../resize-policy';
import { DEFAULT_BARCODE_STATE } from '@/components/editor/types';
import type { LabelElement } from '@/lib/label-document';

test('a barcode cannot be resized below 5 mm (it was 0.5 mm)', () => {
  const barcode = { ...DEFAULT_BARCODE_STATE, id: 'b1', type: 'barcode', left: 5, top: 5, width: 28, height: 11 } as LabelElement;
  assert.equal(resizePolicyFor(barcode).minMm, RESIZE_MIN_PROPORTIONAL_MM);
  assert.ok(resizePolicyFor(barcode).minMm >= 5);
});
