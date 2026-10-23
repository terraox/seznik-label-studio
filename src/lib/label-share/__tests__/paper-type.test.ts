import assert from 'node:assert/strict';
import test from 'node:test';

import { strToU8, zipSync, type Zippable } from 'fflate';

import { LEGACY_PAPER_TYPES, type LabelDocument } from '@/lib/label-document';
import { buildSezlabel } from '../export';
import { finalizeDocument } from '../finalize';
import { parseSezlabel } from '../import';
import { SEZLABEL_MIN_APP_VERSION } from '../limits';
import { sha256Hex } from '../sha256';
import { readZip } from '../zip';
import { APP_VERSION, FakePhone, fakePlacement, importEnv } from './fixtures';

type Rec = Record<string, any>;

const text = { id: 't', type: 'text', text: 'hi', fontSize: 8, fontFamily: 'Default', left: 1, top: 1, width: 10, rotation: 0 };

/** A package as an older app wrote it: any paper type string, correct manifest. */
function oldFile(paperType: unknown): Uint8Array {
  const doc = strToU8(JSON.stringify({ schemaVersion: 1, name: 'old', widthMm: 50, heightMm: 30, orientation: 0, paperType, elements: [text] }));
  const manifest = {
    format: 'sezlabel', schemaVersion: 1, minAppVersion: SEZLABEL_MIN_APP_VERSION, createdWithAppVersion: APP_VERSION,
    createdAt: 1, labelId: 'x', labelName: 'old', palette: [], includesData: false, userClipart: [], fonts: [],
    files: [{ path: 'document.json', bytes: doc.length, sha256: sha256Hex(doc) }],
  };
  const z: Zippable = { 'document.json': doc, 'manifest.json': strToU8(JSON.stringify(manifest)) };
  return zipSync(z);
}

function doc(paperType: string): LabelDocument {
  return {
    id: 'p', name: 'p', widthMm: 50, heightMm: 30, orientation: 0, paperType, elements: [text], groupId: null, createdAt: 1, updatedAt: 1,
  } as unknown as LabelDocument;
}

test('import: Black mark opens as Label; Receipt, Label, Transparent and Cardstock stay', () => {
  for (const old of LEGACY_PAPER_TYPES) {
    const parsed = parseSezlabel(oldFile(old), importEnv());
    assert.equal((parsed.document as Rec).paperType, 'Label', old);
    const imported = finalizeDocument(parsed, { ...fakePlacement(parsed as never, new FakePhone()), name: 'old' });
    assert.equal(imported.paperType, 'Label', old);
    assert.equal(imported.elements.length, 1, old);
  }
  for (const kept of ['Receipt', 'Label', 'Transparent', 'Cardstock'] as const) {
    assert.equal((parseSezlabel(oldFile(kept), importEnv()).document as Rec).paperType, kept);
  }
  for (const odd of [undefined, null, 7, '', 'receipt', 'cardstock', 'Glossy']) {
    assert.equal((parseSezlabel(oldFile(odd), importEnv()).document as Rec).paperType, 'Label', String(odd));
  }
});

test('export writes only Receipt, Label, Transparent or Cardstock', async () => {
  const cases: [string, string][] = [
    ['Receipt', 'Receipt'],
    ['Label', 'Label'],
    ['Transparent', 'Transparent'],
    ['Cardstock', 'Cardstock'],
    ['Glossy', 'Label'],
    ...LEGACY_PAPER_TYPES.map((old) => [old, 'Label'] as [string, string]),
  ];
  for (const [stored, written] of cases) {
    const exported = await buildSezlabel(doc(stored), new FakePhone().exportEnv());
    const json = JSON.parse(new TextDecoder().decode(readZip(exported.bytes).get('document.json')));
    assert.equal(json.paperType, written, stored);
  }
});
