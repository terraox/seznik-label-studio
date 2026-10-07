import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { collectDocumentFontNames, lookupFontFamily, type LookupFont } from '@/lib/fonts/lookup';
import { computeWrappedLines, layoutPrintText, measureTextWidthMm } from '@/lib/text-metrics';
import {
  clearPrintTypefacesForTests,
  getPrintTypeface,
  registerFileBackedTypeface,
} from '@/printing/raster/print-typeface-map';

const bundled: LookupFont[] = [
  { id: 'inter', name: 'Inter', family: 'Inter_400Regular', source: 'bundled' },
  { id: 'pacifico', name: 'Pacifico', family: 'Pacifico_400Regular', source: 'catalog' },
  { id: 'system', name: 'System Default', source: 'bundled' },
];

test('Default, Barcode, empty, and unknown names do not resolve', () => {
  assert.equal(lookupFontFamily(undefined, bundled, []), undefined);
  assert.equal(lookupFontFamily('', bundled, []), undefined);
  assert.equal(lookupFontFamily('Default', bundled, []), undefined);
  assert.equal(lookupFontFamily('Barcode', bundled, []), undefined);
  assert.equal(lookupFontFamily('Nope', bundled, []), undefined);
  assert.equal(lookupFontFamily('System Default', bundled, []), undefined);
});

test('bundled faces resolve without an install record', () => {
  assert.equal(lookupFontFamily('Inter', bundled, []), 'Inter_400Regular');
  assert.equal(lookupFontFamily('inter', bundled, []), 'Inter_400Regular');
});

test('catalog faces stay unresolved until installed, then the file family wins', () => {
  assert.equal(lookupFontFamily('Pacifico', bundled, []), undefined);
  assert.equal(
    lookupFontFamily('Pacifico', bundled, [
      { id: 'pacifico', name: 'Pacifico', familyKey: 'Pacifico_400Regular' },
    ]),
    'Pacifico_400Regular',
  );
});

test('an installed face overrides a bundled family with the same name', () => {
  assert.equal(
    lookupFontFamily('Inter', bundled, [
      { id: 'custom-inter', name: 'Inter', familyKey: 'user_custom' },
    ]),
    'user_custom',
  );
});

test('document font names include text and table cells', () => {
  const names = collectDocumentFontNames({
    elements: [
      { fontFamily: 'Pacifico' },
      { fontFamily: 'Default' },
      {
        fontFamily: 'Inter',
        cells: [[{ fontFamily: 'Caveat' }, { fontFamily: 'Pacifico' }]],
      },
    ],
  });
  assert.deepEqual(names.sort(), ['Caveat', 'Default', 'Inter', 'Pacifico']);
});

test('Monospace resolves to the bundled Roboto Mono face', () => {
  const catalog = readFileSync(new URL('../../../constants/font-library.ts', import.meta.url), 'utf8');
  assert.match(catalog, /name: 'Monospace'[\s\S]*?family: 'RobotoMono_400Regular'/);
  assert.equal(
    lookupFontFamily('Monospace', [
      { id: 'mono', name: 'Monospace', family: 'RobotoMono_400Regular', source: 'bundled' },
    ]),
    'RobotoMono_400Regular',
  );
  const fonts = readFileSync(new URL('../../../lib/app-fonts.ts', import.meta.url), 'utf8');
  assert.match(fonts, /RobotoMono_400Regular/);
  assert.equal(
    existsSync(
      new URL(
        '../../../../node_modules/@expo-google-fonts/roboto-mono/400Regular/RobotoMono_400Regular.ttf',
        import.meta.url,
      ),
    ),
    true,
  );
});

test('Monospace wrap matches between editor lines and print layout', () => {
  const widthMm = measureTextWidthMm('hiii', 12, 0, false, 'Monospace') + 0.2;
  const editor = computeWrappedLines({
    text: 'hiiiiiii',
    fontSize: 12,
    widthMm,
    fontFamily: 'Monospace',
  });
  const print = layoutPrintText({
    text: 'hiiiiiii',
    fontSize: 12,
    widthMm,
    fontFamily: 'Monospace',
  });
  assert.deepEqual(print.lines, editor);
  assert.ok(editor.length >= 2, 'monospace hiiiiiii should wrap inside a four-character width');
  const sans = computeWrappedLines({ text: 'hiiiiiii', fontSize: 12, widthMm });
  assert.equal(sans.length, 1);
});

test('registerFileBackedTypeface keeps the decoded face for print lookup', async () => {
  clearPrintTypefacesForTests();
  const face: { dispose?: () => void } = { dispose() {} };
  const ok = await registerFileBackedTypeface(
    'Pacifico_400Regular',
    'file:///fonts/Pacifico.ttf',
    async (uri) => {
      assert.equal(uri, 'file:///fonts/Pacifico.ttf');
      return face;
    },
  );
  assert.equal(ok, true);
  assert.equal(getPrintTypeface('Pacifico_400Regular'), face);
  const missing = await registerFileBackedTypeface('Gone', 'file:///missing.ttf', async () => null);
  assert.equal(missing, false);
  assert.equal(getPrintTypeface('Gone'), null);
  clearPrintTypefacesForTests();
});
