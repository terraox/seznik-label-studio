import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FONT_SCALE_CAP } from '../font-scale';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('the react-native patch caps Text and TextInput at FONT_SCALE_CAP', () => {
  const patch = read('patches/react-native+0.81.5.patch');
  assert.ok(patch.includes(`+  const _maxFontSizeMultiplier = restProps.maxFontSizeMultiplier ?? ${FONT_SCALE_CAP};`), 'Text.js');
  assert.ok(patch.includes(`+  maxFontSizeMultiplier = ${FONT_SCALE_CAP},`), 'TextInput.js');
});

test('the patch is applied to node_modules', () => {
  const text = read('node_modules/react-native/Libraries/Text/Text.js');
  assert.ok(text.includes(`restProps.maxFontSizeMultiplier ?? ${FONT_SCALE_CAP}`));
  assert.ok(text.includes('maxFontSizeMultiplier={_maxFontSizeMultiplier}'));
  assert.ok(text.includes('maxFontSizeMultiplier: _maxFontSizeMultiplier,'));
  const input = read('node_modules/react-native/Libraries/Components/TextInput/TextInput.js');
  assert.ok(input.includes(`maxFontSizeMultiplier = ${FONT_SCALE_CAP},`));
  assert.ok(input.includes('maxFontSizeMultiplier={maxFontSizeMultiplier}'));
});
