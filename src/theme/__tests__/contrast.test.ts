import test from 'node:test';
import assert from 'node:assert/strict';

import { composite, contrastRatio } from '../contrast';
import { DarkColors as D, LightColors, type ThemeColors } from '../tokens';

/** Backgrounds that text and icons sit on in dark mode. */
const DARK_BACKGROUNDS: (keyof ThemeColors)[] = ['bg', 'surface', 'raised', 'fill'];

const TEXT_TOKENS: (keyof ThemeColors)[] = [
  'text',
  'textSecondary',
  'textMuted',
  'accent',
  'danger',
  'success',
  'warning',
  'link',
  'brandInk',
];

test('dark: text tokens are ≥ 4.5:1 on every background', () => {
  for (const fg of TEXT_TOKENS) {
    for (const bg of DARK_BACKGROUNDS) {
      const ratio = contrastRatio(D[fg], D[bg]);
      assert.ok(ratio >= 4.5, `${fg} ${D[fg]} on ${bg} ${D[bg]} = ${ratio.toFixed(2)}`);
    }
  }
});

test('dark: border is ≥ 3:1 on bg, surface and raised', () => {
  for (const bg of ['bg', 'surface', 'raised'] as const) {
    const ratio = contrastRatio(D.border, D[bg]);
    assert.ok(ratio >= 3, `border on ${bg} = ${ratio.toFixed(2)}`);
  }
});

test('dark: text on filled and tinted surfaces is ≥ 4.5:1', () => {
  const pairs: [string, string, string][] = [
    ['onAccent on accentFill', D.onAccent, D.accentFill],
    ['onAccent on accentStrong', D.onAccent, D.accentStrong],
    ['onHeader on header', D.onHeader, D.header],
    ['onAccent on dangerFill', D.onAccent, D.dangerFill],
    ['onAccent on successFill', D.onAccent, D.successFill],
    ['onAccent on neutralFill', D.onAccent, D.neutralFill],
    ['success on successSoft/surface', D.success, composite(D.successSoft, D.surface)],
    ['accent on accentSoft/surface', D.accent, composite(D.accentSoft, D.surface)],
    ['danger on dangerSoft/surface', D.danger, composite(D.dangerSoft, D.surface)],
    ['onWarningSoft on warningSoft/surface', D.onWarningSoft, composite(D.warningSoft, D.surface)],
    ['text on fillStrong', D.text, D.fillStrong],
    ['textSecondary on fillStrong', D.textSecondary, D.fillStrong],
  ];
  for (const [name, fg, bg] of pairs) {
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `${name} = ${ratio.toFixed(2)}`);
  }
});

test('dark: the white label artboard stands out from the editor background', () => {
  assert.ok(contrastRatio('#FFFFFF', D.canvasArea) >= 15);
});

test('D1: pure black page, white main text', () => {
  assert.equal(D.bg, '#000000');
  assert.equal(D.text, '#FFFFFF');
  assert.deepEqual([D.surface, D.raised, D.fillStrong], ['#121212', '#1E1E1E', '#2A2A2A']);
});

test('light and dark define the same tokens', () => {
  assert.deepEqual(Object.keys(LightColors).sort(), Object.keys(D).sort());
});

test('light: SEZNIK logo palette', () => {
  assert.equal(LightColors.header, '#24275A');
  assert.equal(LightColors.bg, '#F4F7FB');
  assert.equal(LightColors.surface, '#FFFFFF');
  assert.equal(LightColors.accent, '#2DAFE5');
  assert.equal(LightColors.accentStrong, '#1878B8');
  assert.equal(LightColors.danger, '#C8493F');
  assert.equal(LightColors.text, '#1D2140');
  assert.equal(LightColors.textMuted, '#666C88');
  assert.equal(LightColors.textSecondary, '#4A5070');
  assert.equal(LightColors.hairline, '#E4E9F1');
  assert.equal(LightColors.textDisabled, '#A8ADC0');
});
