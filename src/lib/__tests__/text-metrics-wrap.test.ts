import assert from 'node:assert/strict';
import test from 'node:test';

import { elementSizeMm, type LabelElement } from '@/lib/label-document';
import {
  computeTextElementHeightMm,
  computeWrappedLines,
  layoutPrintText,
  measureTextWidthMm,
  ptToMm,
  textLineBoxHeightMm,
} from '@/lib/text-metrics';
import { visibleTextHeightMm, visibleWrappedLines } from '@/lib/visible-text-layout';

test('print line spacing uses the same line box as the editor', () => {
  const font = 12;
  const base = textLineBoxHeightMm(font, '1.0');
  assert.ok(Math.abs(base - ptToMm(font) * 1.25) < 0.001);
  const spaced = layoutPrintText({ text: 'Hello', fontSize: font, widthMm: 40, lineSpacing: '1.5' });
  assert.ok(Math.abs(spaced.lineHeightMm - base * 1.5) < 0.001);
  const doubled = layoutPrintText({ text: 'Hello', fontSize: font, widthMm: 40, lineSpacing: '2.0' });
  assert.ok(Math.abs(doubled.lineHeightMm - base * 2) < 0.001);
});

test('Indic text gets the taller line box on screen and in print', () => {
  const latin = textLineBoxHeightMm(12, '1.0', 'Default', 'Hello');
  const hindi = textLineBoxHeightMm(12, '1.0', 'Default', 'नमस्ते');
  assert.ok(Math.abs(hindi / latin - 1.18) < 0.001);
  const printed = layoutPrintText({
    text: 'नमस्ते',
    fontSize: 12,
    widthMm: 40,
    fontFamily: 'Default',
  });
  assert.ok(Math.abs(printed.lineHeightMm - hindi) < 0.001);
});

test('a vowel sign stays on the same line as its consonant', () => {
  const syllable = 'कि';
  assert.ok(measureTextWidthMm(syllable, 12) < measureTextWidthMm('कक', 12));
  const lines = computeWrappedLines({
    text: syllable,
    fontSize: 12,
    widthMm: measureTextWidthMm('क', 12) + 0.2,
    autoWrapping: 'Char',
  });
  assert.deepEqual(lines, [syllable]);
});

test('a short stored height still keeps every line', () => {
  const text = 'ZUBAIR KING OF SUS';
  const element = {
    id: 't',
    type: 'text',
    text,
    left: 0,
    top: 0,
    width: 28,
    height: 4,
    fontSize: 18,
    autoTextHeight: false,
    autoWrapping: 'Word',
  } as Extract<LabelElement, { type: 'text' }>;
  const size = elementSizeMm(element);
  const natural = visibleTextHeightMm({ text, fontSize: 18, widthMm: 28, autoWrapping: 'Word' });
  assert.ok(size.height >= natural - 0.01);
  assert.ok(size.height > element.height);
  const lines = visibleWrappedLines({ text, fontSize: 18, widthMm: 28, autoWrapping: 'Word', bold: true });
  assert.equal(lines.join(' ').replace(/\s+/g, ' '), text);
});

test('a wider face wraps earlier and still keeps every word', () => {
  const text = 'ZUBAIR KING OF SUS';
  const narrow = visibleWrappedLines({ text, fontSize: 14, widthMm: 30, autoWrapping: 'Word' });
  const wide = computeWrappedLines({
    text,
    fontSize: 14,
    widthMm: 30,
    autoWrapping: 'Word',
    measureWidth: (sample) => measureTextWidthMm(sample, 14) * 1.25,
  });
  assert.ok(wide.length >= narrow.length);
  assert.equal(wide.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  const height = visibleTextHeightMm({ text, fontSize: 14, widthMm: 30, autoWrapping: 'Word', bold: true });
  assert.ok(height >= computeTextElementHeightMm({ text, fontSize: 14, widthMm: 30, bold: true }) - 0.05);
});

test('character spacing widens the measured line', () => {
  const plain = measureTextWidthMm('ABCD', 12, 0);
  const spaced = measureTextWidthMm('ABCD', 12, 0.4);
  assert.ok(spaced > plain + 1);
});
