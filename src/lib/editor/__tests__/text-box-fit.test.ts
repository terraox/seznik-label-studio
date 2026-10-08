import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import { fitTextBoxToContent, growTextFrameHeightForWidth, mergeTextElementPatch } from '@/lib/element-sizing';
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

test('mergeTextElementPatch keeps width and reflows height when the font changes', () => {
  const start = textEl('hiiiiiii', { width: 12, height: 6, fontFamily: 'Inter', autoTextHeight: false });
  const next = mergeTextElementPatch(start, { fontFamily: 'Monospace' }, canvas);
  assert.equal(next.type, 'text');
  if (next.type !== 'text') return;
  assert.equal(next.fontFamily, 'Monospace');
  assert.equal(next.width, 12);
  assert.ok(typeof next.height === 'number' && next.height >= 4);
});

test('mergeTextElementPatch keeps an explicit box height from a resize', () => {
  const start = textEl('Hello world', { width: 24, height: 6, autoTextHeight: true, autoWrapping: 'Close' });
  const next = mergeTextElementPatch(start, { width: 8, height: 12, autoWrapping: 'Word', autoTextHeight: false }, canvas);
  assert.equal(next.type, 'text');
  if (next.type !== 'text') return;
  assert.equal(next.width, 8);
  assert.equal(next.height, 12);
  assert.equal(next.fontSize, 12);
  assert.equal(next.autoWrapping, 'Word');
});

test('narrowing a text frame grows height so wrapped lines stay visible', () => {
  const start = textEl('PACKED FRESH TODAY', { width: 40, height: 6, fontSize: 12 });
  const tall = growTextFrameHeightForWidth(start, 8, start.height);
  assert.ok(tall > start.height, `wrapped height ${tall} should exceed ${start.height}`);
});

test('changing font keeps width and grows height for wrapped text', () => {
  const start = textEl('SEZ NIK INDIA', {
    width: 10,
    height: 6,
    fontSize: 14,
    autoTextHeight: false,
    fontFamily: 'Default',
  });
  const next = mergeTextElementPatch(
    start,
    { fontFamily: 'Pacifico', fontSize: 14 },
    canvas,
  );
  assert.equal(next.type, 'text');
  if (next.type !== 'text') return;
  assert.equal(next.width, 10);
  assert.ok(typeof next.height === 'number' && next.height > 6);
});

test('decorative fonts reserve taller line boxes than Default', () => {
  const narrow = 10;
  const plain = growTextFrameHeightForWidth(
    textEl('SEZ NIK INDIA', { width: narrow, height: 6, fontSize: 14, fontFamily: 'Default' }),
    narrow,
    6,
  );
  const script = growTextFrameHeightForWidth(
    textEl('SEZ NIK INDIA', { width: narrow, height: 6, fontSize: 14, fontFamily: 'Pacifico' }),
    narrow,
    6,
  );
  assert.ok(script >= plain, `script ${script} should be at least default ${plain}`);
});

test('explicit newlines grow height', () => {
  const one = fitTextBoxToContent(textEl('Line'), canvas);
  const two = fitTextBoxToContent(textEl('Line\nLine'), canvas);
  assert.ok(two.height > one.height + 1, `two-line height ${two.height} vs ${one.height}`);
});
