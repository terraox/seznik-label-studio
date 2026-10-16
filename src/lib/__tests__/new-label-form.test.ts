import test from 'node:test';
import assert from 'node:assert/strict';

import { composeUpsDocument, createLabelDocument, createUpsConfig } from '@/lib/label-document';
import {
  clampColumns,
  initialFormState,
  parseGapMm,
  parseMm,
  presetLabelFor,
  sanitizeNumberText,
  stepGap,
  switchShape,
  totalWidthMm,
  validateForm,
  widthWarning,
  resolvedName,
  cellSize,
  type FormState,
} from '@/lib/new-label-form';

const base = (over: Partial<FormState> = {}): FormState => ({ ...initialFormState({}), ...over });

test('parseMm accepts dot and comma, rejects junk', () => {
  assert.equal(parseMm('50'), 50);
  assert.equal(parseMm('50.5'), 50.5);
  assert.equal(parseMm('50,5'), 50.5);
  assert.equal(parseMm('5.'), 5);
  assert.equal(parseMm(''), null);
  assert.equal(parseMm('.'), null);
  assert.equal(parseMm('abc'), null);
  assert.equal(parseMm('-3'), null);
  assert.equal(parseMm('0'), null);
});

test('parseGapMm allows zero and negatives', () => {
  assert.equal(parseGapMm('0'), 0);
  assert.equal(parseGapMm('-2.5'), -2.5);
  assert.equal(parseGapMm('1,5'), 1.5);
  assert.equal(parseGapMm(''), null);
  assert.equal(parseGapMm('-'), null);
});

test('sanitizeNumberText keeps digits and one separator', () => {
  assert.equal(sanitizeNumberText('5a0.5.2'), '50.52');
  assert.equal(sanitizeNumberText('1,2,3'), '1,23');
  assert.equal(sanitizeNumberText('--4'), '4');
});

test('size limits at the edges', () => {
  for (const [v, ok] of [['7.99', false], ['8', true], ['310', true], ['310.01', false]] as const) {
    assert.equal(validateForm(base({ width: v })).canCreate, ok, `width ${v}`);
    assert.equal(validateForm(base({ height: v })).canCreate, ok, `height ${v}`);
    assert.equal(validateForm(base({ shape: 'circle', diameter: v })).canCreate, ok, `diameter ${v}`);
  }
  assert.equal(validateForm(base({ width: '' })).errors.width, 'Enter a number');
});

test('gap limits only matter above one column', () => {
  assert.equal(validateForm(base({ columns: 1, gap: '99' })).canCreate, true);
  assert.equal(validateForm(base({ columns: 2, gap: '-4' })).canCreate, true);
  assert.equal(validateForm(base({ columns: 2, gap: '-4.5' })).canCreate, false);
  assert.equal(validateForm(base({ columns: 2, gap: '20' })).canCreate, true);
  assert.equal(validateForm(base({ columns: 2, gap: '20.5' })).canCreate, false);
  assert.equal(validateForm(base({ columns: 2, gap: '' })).canCreate, false);
});

test('stepGap moves by 0.5 within -4..20', () => {
  assert.equal(stepGap('0', 1), '0.5');
  assert.equal(stepGap('0', -1), '-0.5');
  assert.equal(stepGap('-4', -1), '-4');
  assert.equal(stepGap('20', 1), '20');
  assert.equal(stepGap('', 1), '0.5');
});

test('clampColumns is 1..6', () => {
  assert.equal(clampColumns(0), 1);
  assert.equal(clampColumns(3), 3);
  assert.equal(clampColumns(9), 6);
});

test('totalWidthMm matches composeUpsDocument', () => {
  for (const [cols, w, gap] of [[2, 50, 0], [3, 40, 3], [6, 15, 2], [4, 30, -2], [2, 25.5, 1.5]] as const) {
    const ups = createUpsConfig({ columns: cols, columnSpacingMm: gap });
    const doc = createLabelDocument({ name: 't', widthMm: w, heightMm: 20 });
    doc.ups = ups;
    assert.equal(composeUpsDocument(doc).widthMm, totalWidthMm(w, cols, gap), `${cols}x${w} gap ${gap}`);
  }
  assert.equal(totalWidthMm(50, 1, 5), 50);
});

test('createUpsConfig now allows 6 columns and clamps 7', () => {
  assert.equal(createUpsConfig({ columns: 6 }).columns, 6);
  assert.equal(createUpsConfig({ columns: 7 }).columns, 6);
  assert.equal(createUpsConfig({ columns: 1 }).columns, 2);
});

test('widthWarning only above a known printer width', () => {
  assert.equal(widthWarning(100, 108), null);
  assert.equal(widthWarning(108, 108), null);
  assert.ok(widthWarning(108.5, 108));
  assert.equal(widthWarning(500, null), null);
});

test('presetLabelFor', () => {
  assert.equal(presetLabelFor('rectangle', 50, 30), '50 × 30');
  assert.equal(presetLabelFor('rectangle', 50.1, 30), '50 × 30');
  assert.equal(presetLabelFor('rectangle', 50.2, 30), 'Custom');
  assert.equal(presetLabelFor('circle', 50, 50), 'Custom');
  assert.equal(presetLabelFor('rectangle', null, 30), 'Custom');
});

test('shape switching keeps both sets of values', () => {
  let s = base({ width: '60', height: '40' });
  s = switchShape(s, 'circle');
  assert.equal(s.shape, 'circle');
  assert.equal(s.diameter, '40');
  assert.equal(s.columns, 1);
  s = { ...s, diameter: '35' };
  s = switchShape(s, 'rectangle');
  assert.equal(s.width, '60');
  assert.equal(s.height, '40');
  s = switchShape(s, 'circle');
  assert.equal(s.diameter, '35');
  assert.deepEqual(cellSize(s), { w: 35, h: 35 });
});

test('initialFormState for each entry point', () => {
  const plain = initialFormState({});
  assert.deepEqual([plain.columns, plain.width, plain.height, plain.name], [1, '50', '30', 'Default label']);

  const two = initialFormState({ isTwoUps: 'true' });
  assert.deepEqual([two.columns, two.gap, two.name], [2, '0', '2ups label']);

  // Custom Size sets isSingleCanvas but must still allow Labels across.
  const custom = initialFormState({ isSingleCanvas: 'true' });
  assert.equal(custom.columns, 1);
  const customTwo = initialFormState({ isSingleCanvas: 'true', isTwoUps: 'true' });
  assert.equal(customTwo.columns, 2);

  const img = initialFormState({ importImageUri: 'file:///x.png', isTwoUps: 'true' });
  assert.deepEqual([img.columns, img.name], [1, 'Imported Image Label']);
  assert.equal(initialFormState({ importImageUri: 'x', isJewelleryTag: 'true' }).name, 'Jewellery Image Label');

  const tag = initialFormState({ defaultWidth: '14', defaultHeight: '96', importImageUri: 'x' });
  assert.deepEqual([tag.width, tag.height], ['14', '96']);

  const clone = initialFormState({ isClone: 'true', cloneName: 'Box', cloneWidth: '40', cloneHeight: '20' });
  assert.deepEqual([clone.name, clone.width, clone.height], ['Box Copy', '40', '20']);
  assert.equal(initialFormState({ isClone: 'true' }).name, 'Label Copy');

  const jew = initialFormState({ isJewellery3Up: 'true' });
  assert.equal(jew.columns, 3);
  assert.equal(jew.name, 'Jewellery Label');
});

test('resolvedName falls back and trims', () => {
  assert.equal(resolvedName('   '), 'Default label');
  assert.equal(resolvedName('  Box  '), 'Box');
  assert.equal(resolvedName('x'.repeat(100)).length, 60);
});
