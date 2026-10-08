import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isCatalogFontInstalled,
  isFontNameReady,
  needsFontDownload,
} from '@/lib/fonts/availability';
import type { FontLibraryItem } from '@/constants/font-library';

const library: FontLibraryItem[] = [
  {
    id: 'poppins',
    name: 'Poppins',
    family: 'Poppins_400Regular',
    category: 'common',
    sample: 'Poppins',
    source: 'bundled',
  },
  {
    id: 'pacifico',
    name: 'Pacifico',
    family: 'Pacifico_400Regular',
    category: 'creative',
    sample: 'Pacifico',
    source: 'catalog',
    downloadUrl: 'https://example.com/pacifico.ttf',
  },
];

test('bundled catalog entries are ready without install', () => {
  assert.equal(isCatalogFontInstalled(library[0], []), true);
  assert.equal(isFontNameReady('Poppins', [], library), true);
});

test('catalog entries need download before they are ready', () => {
  assert.equal(isCatalogFontInstalled(library[1], []), false);
  assert.equal(isFontNameReady('Pacifico', [], library), false);
  assert.equal(needsFontDownload('Pacifico', [], library), true);
  const installed = [
    {
      id: 'pacifico',
      name: 'Pacifico',
      familyKey: 'Pacifico_400Regular',
      fileUri: 'file:///p.ttf',
      category: 'creative' as const,
      source: 'downloaded' as const,
    },
  ];
  assert.equal(isCatalogFontInstalled(library[1], installed), true);
  assert.equal(isFontNameReady('Pacifico', installed, library), true);
  assert.equal(needsFontDownload('Pacifico', installed, library), false);
});
