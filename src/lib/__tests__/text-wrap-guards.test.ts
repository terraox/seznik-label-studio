import assert from 'node:assert/strict';
import test from 'node:test';

import { computeTextElementHeightMm, computeWrappedLines, MAX_WRAP_LINES } from '@/lib/text-metrics';

type Mode = 'Word' | 'Char' | 'Close';
const MODES: Mode[] = ['Word', 'Char', 'Close'];

function run(text: string, widthMm: number, mode: Mode = 'Word', fontSize = 12) {
  const t0 = Date.now();
  const lines = computeWrappedLines({ text, fontSize, widthMm, autoWrapping: mode });
  const ms = Date.now() - t0;
  assert.ok(ms < 500, `took ${ms}ms`);
  assert.ok(lines.length >= 1);
  return lines;
}

const LONG = 'x'.repeat(5000);

test('width 0, negative, NaN, Infinity and sub-glyph widths terminate with one cluster per line', () => {
  for (const mode of MODES) {
    for (const w of [0, -5, Number.NaN, 0.01, 0.2]) {
      const lines = run('hello world', w, mode);
      if (mode === 'Close') assert.deepEqual(lines, ['hello world']);
      else assert.ok(lines.length <= 'hello world'.length, `${mode} ${w} -> ${lines.length}`);
    }
    assert.ok(run('hello world', Number.POSITIVE_INFINITY, mode).length >= 1);
  }
});

test('nothing typed is dropped at tiny widths', () => {
  for (const w of [0, Number.NaN, 0.3]) {
    assert.equal(run('hello world', w, 'Char').join(''), 'hello world');
    assert.equal(run('hello world', w, 'Word').join('').replace(/ /g, ''), 'helloworld');
  }
});

test('empty text is one empty line', () => {
  for (const mode of MODES) assert.deepEqual(run('', 30, mode), ['']);
});

test('a very long unbroken string wraps, keeps every character, and is capped', () => {
  for (const mode of ['Word', 'Char'] as Mode[]) {
    const lines = run(LONG, 20, mode);
    assert.ok(lines.length <= MAX_WRAP_LINES + 1);
    assert.equal(lines.join(''), LONG);
  }
});

test('emoji and combining marks are never dropped', () => {
  const text = '😀😀😀 कि कि 👨‍👩‍👧';
  for (const w of [0, 0.3, 5, 40]) {
    const joined = run(text, w, 'Char').join('');
    assert.equal(joined, text);
  }
});

test('only newlines gives one empty line per newline plus one', () => {
  assert.equal(run('\n\n\n', 30).length, 4);
  assert.equal(run('\n'.repeat(2000), 30).length <= MAX_WRAP_LINES + 1, true);
});

test('a very large text returns quickly and is capped', () => {
  const big = 'lorem ipsum dolor sit amet '.repeat(20000);
  const t0 = Date.now();
  const lines = run(big, 0.5, 'Word');
  assert.ok(lines.length <= MAX_WRAP_LINES + 1);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(lines.join(' ').replace(/\s+/g, ''), big.replace(/\s+/g, ''));
});

test('identical input gives identical output and height every time', () => {
  const args = { text: 'The quick brown fox jumps', fontSize: 10, widthMm: 18 };
  const first = computeWrappedLines(args);
  const h = computeTextElementHeightMm(args);
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(computeWrappedLines(args), first);
    assert.equal(computeTextElementHeightMm(args), h);
  }
});

test('height comes from the line count only', () => {
  const one = computeTextElementHeightMm({ text: 'hi', fontSize: 10, widthMm: 40 });
  const many = computeTextElementHeightMm({ text: 'hi '.repeat(200), fontSize: 10, widthMm: 20 });
  assert.ok(many > one);
  assert.ok(Number.isFinite(computeTextElementHeightMm({ text: 'hi', fontSize: 10, widthMm: Number.NaN })));
});
