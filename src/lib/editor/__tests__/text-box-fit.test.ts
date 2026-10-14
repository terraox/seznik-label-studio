import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import {
  fitNewTextDefaults,
  fitTextBoxToContent,
  fitTextDefaults,
  growTextFrameHeightForWidth,
  mergeTextElementPatch,
} from '@/lib/element-sizing';
import { computeTextElementHeightMm } from '@/lib/text-metrics';
import { visibleTextHeightMm, visibleWrappedLines } from '@/lib/visible-text-layout';
import { measureTextWidthMm } from '@/lib/text-metrics';
import { elementSizeMm, type LabelElement } from '@/lib/label-document';

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
  const size = elementSizeMm(next);
  assert.ok(size.height >= elementSizeMm(start).height);
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

test('mergeTextElementPatch reflows height when width narrows (ignores stale height in patch)', () => {
  const start = textEl('Hello world', { width: 24, height: 6, autoTextHeight: true, autoWrapping: 'Close' });
  const next = mergeTextElementPatch(start, { width: 8, height: 12, autoWrapping: 'Word', autoTextHeight: false }, canvas);
  assert.equal(next.type, 'text');
  if (next.type !== 'text') return;
  assert.equal(next.width, 8);
  const expected = visibleTextHeightMm({
    text: 'Hello world',
    fontSize: 12,
    widthMm: 8,
    autoWrapping: 'Word',
  });
  assert.equal(next.height, expected);
  assert.ok(
    expected >=
      computeTextElementHeightMm({
        text: 'Hello world',
        fontSize: 12,
        widthMm: 8,
        autoWrapping: 'Word',
      }),
    'visible height keeps every line the em table would draw',
  );
  assert.ok(expected > 12, 'narrower box should need more vertical space than a short manual height');
  assert.equal(next.fontSize, 12);
  assert.equal(next.autoWrapping, 'Word');
});

test('narrowing a text frame grows height so wrapped lines stay visible', () => {
  const start = textEl('PACKED FRESH TODAY', { width: 40, height: 6, fontSize: 12 });
  const tall = growTextFrameHeightForWidth(start, 8, start.height);
  assert.ok(tall > start.height, `wrapped height ${tall} should exceed ${start.height}`);
});

test('fontSize-only patch keeps width and reflows height to content lines', () => {
  const start = textEl('Hi', {
    width: 14,
    height: 8,
    fontSize: 12,
    autoTextHeight: false,
  });
  const next = mergeTextElementPatch(start, { fontSize: 18 }, canvas);
  assert.equal(next.type, 'text');
  if (next.type !== 'text') return;
  assert.equal(next.fontSize, 18);
  assert.equal(next.width, 14);
  const expected = computeTextElementHeightMm({
    text: 'Hi',
    fontSize: 18,
    widthMm: 14,
    autoWrapping: 'Word',
  });
  assert.equal(next.height, expected);
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

test('dragging an auto-height text box wider keeps the wider frame', () => {
  const start = textEl('Double tap to add text', { width: 31, fontSize: 8.5, autoTextHeight: true, autoWrapping: 'Word' });
  const wide = mergeTextElementPatch(start, { width: 60, autoWrapping: 'Word' }, { widthMm: 100, heightMm: 50 });
  assert.equal(elementSizeMm(wide).width, 60);
  const narrow = mergeTextElementPatch(start, { width: 12, autoWrapping: 'Word' }, { widthMm: 100, heightMm: 50 });
  assert.equal(elementSizeMm(narrow).width, 12);
  assert.ok(elementSizeMm(narrow).height > elementSizeMm(start).height, 'narrowing wraps onto more lines');
});

test('new text box stays a share of the label when the auto-fit font is large', () => {
  for (const [w, h] of [[50, 30], [100, 50], [75, 50]]) {
    const fit = fitNewTextDefaults(w, h, [], fitTextDefaults(w, h, []).fontSize);
    assert.ok(fit.width <= w * 0.72, `${w}x${h}: box ${fit.width} spans too much of the label`);
    assert.ok(fit.fontSize >= 8.5);
  }
});

test('a fitted new text box keeps the placeholder on one line at every font size', () => {
  for (const fontSize of [4, 6, 8.5, 9, 10.5, 12, 14.5, 18, 24]) {
    const el = textEl('Double tap to add text', { fontSize, autoWrapping: 'Word', autoTextHeight: true, left: 1 });
    const fitted = fitTextBoxToContent(el, { widthMm: 200, heightMm: 100 });
    const lines = visibleWrappedLines({
      text: 'Double tap to add text',
      fontSize,
      widthMm: fitted.width,
      autoWrapping: 'Word',
    });
    assert.equal(lines.length, 1, `font ${fontSize}: placeholder wrapped to ${lines.length} lines in a ${fitted.width} mm box`);
  }
});
