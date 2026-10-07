import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import { fitTextBoxToContent, mergeTextElementPatch } from '@/lib/element-sizing';
import { measureTextWidthMm } from '@/lib/text-metrics';
import type { LabelElement } from '@/lib/label-document';

const canvas = { widthMm: 50, heightMm: 30 };

function textEl(text: string, extra: Partial<LabelElement> = {}): Extract<LabelElement, { type: 'text' }> {
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: 't1',
    type: 'text',
    text,
    left: 2,
    top: 2,
    width: 10,
    height: 5,
    fontSize: 12,
    ...extra,
  } as Extract<LabelElement, { type: 'text' }>;
}

test('fitTextBoxToContent grows width with typed text and keeps right/bottom padding', () => {
  const short = fitTextBoxToContent(textEl('Hi'), canvas);
  const long = fitTextBoxToContent(textEl('Hello world'), canvas);
  assert.ok(long.width > short.width, `long ${long.width} should exceed short ${short.width}`);
  const natural = measureTextWidthMm('Hello world', 12);
  assert.ok(long.width >= natural + 0.9, `width ${long.width} should include padding beyond ${natural}`);
  const lineH = fitTextBoxToContent(textEl('Hi'), canvas).height;
  assert.ok(lineH > 3, 'height includes line box plus bottom pad');
});

test('mergeTextElementPatch applies content-fit when text is edited', () => {
  const start = textEl('A', { width: 8, height: 4 });
  const next = mergeTextElementPatch(start, { text: 'PACKED FRESH' }, canvas);
  assert.equal(next.type, 'text');
  if (next.type !== 'text') return;
  assert.ok(next.width > start.width);
  assert.ok(typeof next.height === 'number' && next.height >= start.height);
});

test('explicit newlines grow height', () => {
  const one = fitTextBoxToContent(textEl('Line'), canvas);
  const two = fitTextBoxToContent(textEl('Line\nLine'), canvas);
  assert.ok(two.height > one.height + 1, `two-line height ${two.height} vs ${one.height}`);
});
