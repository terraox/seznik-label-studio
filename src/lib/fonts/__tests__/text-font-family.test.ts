import assert from 'node:assert/strict';
import test from 'node:test';

import type { LookupFont } from '@/lib/fonts/lookup';
import {
  detectScriptFamily,
  INDIC_SCRIPT_FAMILIES,
  needsComplexTextShaping,
  requiredPrintFamilyKeys,
  resolveTextFontFamily,
} from '@/lib/fonts/text-font-family';
import { measureTextWidthMm, ptToMm } from '@/lib/text-metrics';

const bundled: LookupFont[] = [
  { id: 'inter', name: 'Inter', family: 'Inter_400Regular', source: 'bundled' },
  { id: 'poppins', name: 'Poppins', family: 'Poppins_400Regular', source: 'bundled' },
  {
    id: 'noto-devanagari',
    name: 'Noto Sans Devanagari',
    family: INDIC_SCRIPT_FAMILIES.devanagari,
    source: 'bundled',
  },
  {
    id: 'noto-tamil',
    name: 'Noto Sans Tamil',
    family: INDIC_SCRIPT_FAMILIES.tamil,
    source: 'bundled',
  },
  { id: 'pacifico', name: 'Pacifico', family: 'Pacifico_400Regular', source: 'catalog' },
];

test('Default and Latin-only text stay unset', () => {
  assert.equal(detectScriptFamily('Hello 123'), undefined);
  assert.equal(resolveTextFontFamily('Hello', 'Default', bundled), undefined);
  assert.equal(resolveTextFontFamily('Hello', undefined, bundled), undefined);
  assert.equal(resolveTextFontFamily('', 'Default', bundled), undefined);
});

test('Indic strings need complex shaping', () => {
  assert.equal(needsComplexTextShaping('Hello'), false);
  assert.equal(needsComplexTextShaping('नमस्ते'), true);
});

test('Default Hindi uses Noto Sans Devanagari', () => {
  assert.equal(detectScriptFamily('नमस्ते'), INDIC_SCRIPT_FAMILIES.devanagari);
  assert.equal(
    resolveTextFontFamily('नमस्ते', 'Default', bundled),
    INDIC_SCRIPT_FAMILIES.devanagari,
  );
  assert.equal(
    resolveTextFontFamily('Hello नमस्ते', 'Default', bundled),
    INDIC_SCRIPT_FAMILIES.devanagari,
  );
});

test('a Latin bundled face yields to the script Noto', () => {
  assert.equal(resolveTextFontFamily('नमस्ते', 'Inter', bundled), INDIC_SCRIPT_FAMILIES.devanagari);
  assert.equal(resolveTextFontFamily('தமிழ்', 'Poppins', bundled), INDIC_SCRIPT_FAMILIES.tamil);
  assert.equal(resolveTextFontFamily('Hello', 'Inter', bundled), 'Inter_400Regular');
});

test('an explicit Indian Noto is kept even for Latin text', () => {
  assert.equal(
    resolveTextFontFamily('Hello', 'Noto Sans Devanagari', bundled),
    INDIC_SCRIPT_FAMILIES.devanagari,
  );
});

test('other bundled scripts map to their Noto faces', () => {
  assert.equal(detectScriptFamily('বাংলা'), INDIC_SCRIPT_FAMILIES.bengali);
  assert.equal(detectScriptFamily('తెలుగు'), INDIC_SCRIPT_FAMILIES.telugu);
  assert.equal(detectScriptFamily('ಕನ್ನಡ'), INDIC_SCRIPT_FAMILIES.kannada);
  assert.equal(detectScriptFamily('മലയാളം'), INDIC_SCRIPT_FAMILIES.malayalam);
  assert.equal(detectScriptFamily('ગુજરાતી'), INDIC_SCRIPT_FAMILIES.gujarati);
  assert.equal(detectScriptFamily('ਪੰਜਾਬੀ'), INDIC_SCRIPT_FAMILIES.gurmukhi);
});

test('Devanagari advance is a full em so wrap is not Latin-narrow', () => {
  const em = ptToMm(12);
  assert.ok(Math.abs(measureTextWidthMm('न', 12) - em) < 0.01);
});

test('required print families include script Notos and table cells', () => {
  const keys = requiredPrintFamilyKeys(
    {
      elements: [
        { fontFamily: 'Default', text: 'नमस्ते' },
        { fontFamily: 'Inter', text: 'Hello' },
        {
          fontFamily: 'Default',
          cells: [[{ fontFamily: 'Poppins', text: 'தமிழ்' }, { text: 'OK' }]],
        },
      ],
    },
    bundled,
  );
  assert.deepEqual(keys.sort(), [
    'Inter_400Regular',
    INDIC_SCRIPT_FAMILIES.devanagari,
    INDIC_SCRIPT_FAMILIES.tamil,
  ].sort());
});
