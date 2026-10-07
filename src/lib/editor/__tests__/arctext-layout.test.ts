import test from 'node:test';
import assert from 'node:assert/strict';
import { computeArcTextLayout } from '../arctext-layout';

test('computeArcTextLayout produces circular guide line geometry', () => {
  const result = computeArcTextLayout({
    text: 'Test',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 12,
    lineWidthMm: 0.25,
    scale: 2,
  });

  assert.equal(result.cx, 50);
  assert.equal(result.cy, 50);
  assert.ok(result.radius > 40 && result.radius < 50);
  assert.ok(result.strokeWidth >= 0.5);
  assert.equal(result.characters.length, 4);
});

test('computeArcTextLayout centers text symmetrically at 12 o’clock', () => {
  const result = computeArcTextLayout({
    text: 'ABA',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 10,
  });

  // Middle character 'B' should be very close to x = 50 (center) and at top (lowest y)
  const middleChar = result.characters[1];
  assert.equal(middleChar.char, 'B');
  assert.ok(Math.abs(middleChar.x - 50) < 1.0, `Expected middle char x close to 50, got ${middleChar.x}`);
  assert.ok(Math.abs(middleChar.rotationDeg) < 3.0, `Expected middle char rotation close to 0 deg, got ${middleChar.rotationDeg}`);

  // First character 'A' is to the left (x < 50, rotation < 0)
  const firstChar = result.characters[0];
  assert.ok(firstChar.x < 50, `Expected first char x < 50, got ${firstChar.x}`);
  assert.ok(firstChar.rotationDeg < 0, `Expected first char rotation < 0, got ${firstChar.rotationDeg}`);

  // Last character 'A' is to the right (x > 50, rotation > 0)
  const lastChar = result.characters[2];
  assert.ok(lastChar.x > 50, `Expected last char x > 50, got ${lastChar.x}`);
  assert.ok(lastChar.rotationDeg > 0, `Expected last char rotation > 0, got ${lastChar.rotationDeg}`);
});

test('computeArcTextLayout differentiates character widths (e.g. i vs W)', () => {
  const narrowResult = computeArcTextLayout({
    text: 'iii',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 10,
  });

  const wideResult = computeArcTextLayout({
    text: 'WWW',
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: 10,
  });

  const narrowSpan = narrowResult.characters[2].x - narrowResult.characters[0].x;
  const wideSpan = wideResult.characters[2].x - wideResult.characters[0].x;

  assert.ok(wideSpan > narrowSpan * 2, `Wide span (${wideSpan}) should be more than double narrow span (${narrowSpan})`);
});

test('computeArcTextLayout caps font size on very small boxes to avoid overlap', () => {
  const result = computeArcTextLayout({
    text: 'HELLO',
    widthPx: 28,
    heightPx: 28,
    nominalFontSizePx: 16,
  });

  assert.ok(
    result.effectiveFontSizePx < 16,
    `Expected font to shrink for a 28px box, got ${result.effectiveFontSizePx}`,
  );
  assert.ok(
    result.effectiveFontSizePx <= result.radius * 0.24 + 0.01,
    `Font ${result.effectiveFontSizePx}px should stay within radius ${result.radius}px`,
  );
});

test('computeArcTextLayout never lets letters wrap past a full circle', () => {
  const result = computeArcTextLayout({
    text: 'bestbestbestbestbestbestbestbest',
    widthPx: 80,
    heightPx: 80,
    nominalFontSizePx: 48,
  });

  const angles = result.characters.map((item) =>
    Math.atan2(item.y - result.cy, item.x - result.cx),
  );
  let span = 0;
  for (let i = 1; i < angles.length; i++) {
    let step = angles[i] - angles[i - 1];
    while (step < 0) step += Math.PI * 2;
    while (step > Math.PI) step -= Math.PI * 2;
    span += Math.abs(step);
  }
  assert.ok(span < (330 * Math.PI) / 180, `Arc span ${span} rad should stay under 330 degrees`);
  assert.ok(
    result.effectiveFontSizePx <= result.radius * 0.24 + 0.01,
    `Font ${result.effectiveFontSizePx}px too large for radius ${result.radius}px`,
  );
});

test('computeArcTextLayout auto-shrinks font size to fit when text exceeds circumference', () => {
  const longText = 'THIS IS AN EXTREMELY LONG TEXT STRING THAT DEFINITELY EXCEEDS 360 DEGREES OF THE CIRCLE AT NOMINAL SIZE';
  const nominalFontSize = 16;
  const result = computeArcTextLayout({
    text: longText,
    widthPx: 100,
    heightPx: 100,
    nominalFontSizePx: nominalFontSize,
  });

  assert.ok(
    result.effectiveFontSizePx < nominalFontSize,
    `Expected font to auto-shrink below ${nominalFontSize}, got ${result.effectiveFontSizePx}`
  );
  assert.equal(result.characters.length, longText.length);
});
