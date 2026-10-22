import assert from 'node:assert/strict';
import test from 'node:test';

import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { resolveDocumentForPage } from '@/lib/data-binding';
import { isLocalImageUri } from '@/lib/editor/image-mono';
import { buildSezlabel } from '../export';
import { parseSezlabel } from '../import';
import { previewDocument } from '../preview';
import { countsLine, groupMissing, importNote, shareResultLine } from '../summary';
import { compareVersions } from '../version';
import { base64ToBytes, bytesToBase64 } from '../base64';
import { protectImportUris, protectedImportUris, releaseImportUris } from '../import-guard';
import { FakePhone, fullDocument, importEnv } from './fixtures';

type Rec = Record<string, any>;

test('web addresses are never local picture addresses', () => {
  for (const ok of ['file:///a/b.png', 'content://media/1', 'ph://ABC', 'asset:/x', 'assets-library://x', 'photo.jpg']) {
    assert.equal(isLocalImageUri(ok), true, ok);
  }
  for (const bad of ['http://x/a.png', 'https://evil.example/a.png', 'HTTPS://x/y.jpg', 'ftp://x/a.png', 'data:image/png;base64,AAAA', '', '   ', 'hello']) {
    assert.equal(isLocalImageUri(bad), false, bad);
  }
});

function boundDoc(cell: string): { doc: LabelDocument; sheet: { name: string; columns: string[]; rows: string[][] } } {
  const image = {
    id: 'i', type: 'image', uri: 'file:///local/a.png', printUri: 'file:///local/a.png', left: 1, top: 1, width: 10, height: 10,
    rotation: 0, lockMovement: false, needPrinting: true, antiColor: false, contentType: 'Data Source', columnNameContent: 'pic',
  } as unknown as LabelElement;
  const doc = { id: 'd', name: 'd', widthMm: 50, heightMm: 30, orientation: 0, paperType: 'Label', elements: [image], groupId: null, createdAt: 1, updatedAt: 1 } as LabelDocument;
  return { doc, sheet: { name: 's', columns: ['pic'], rows: [[cell]] } };
}

test('print-time binding: a spreadsheet cell with a web address never becomes the picture', () => {
  for (const cell of ['https://evil.example/track.png', 'http://x/a.jpg', 'data:image/png;base64,AAAA']) {
    const { doc, sheet } = boundDoc(cell);
    const out = resolveDocumentForPage(doc, sheet, 0).elements[0] as Rec;
    assert.equal(out.uri, 'file:///local/a.png', cell);
    assert.ok(!/^https?:/i.test(out.printUri ?? ''), cell);
  }
  const { doc, sheet } = boundDoc('file:///local/b.png');
  assert.equal((resolveDocumentForPage(doc, sheet, 0).elements[0] as Rec).uri, 'file:///local/b.png');
});

test('print-time guard: a web address already stored in an image is blanked before drawing', () => {
  const { doc, sheet } = boundDoc('x');
  const el = doc.elements[0] as Rec;
  el.contentType = 'Local Image';
  el.uri = 'https://evil.example/a.png';
  el.printUri = 'http://evil.example/b.png';
  const out = resolveDocumentForPage(doc, sheet, 0).elements[0] as Rec;
  assert.equal(out.uri, '');
  assert.equal(out.printUri, undefined);
});

test('result line and counts read like the spec', () => {
  assert.equal(shareResultLine('Shelf', { elements: 3, images: 3, userClipart: 0, fonts: [], fontFiles: 0, skipped: [] }), "Shared 'Shelf' - 3 images, no data");
  assert.equal(shareResultLine('A', { elements: 1, images: 1, userClipart: 2, fonts: [], fontFiles: 1, skipped: [] }), "Shared 'A' - 1 image, 2 own clipart, 1 font, no data");
  assert.equal(countsLine({ text: 3, qrcode: 1, shape: 2, line: 0 }), '3 texts, 1 QR code, 2 shapes');
  assert.equal(countsLine({}), 'no elements');
  const groups = groupMissing([{ kind: 'font', name: 'Inter' }, { kind: 'clipart', name: 'x' }, { kind: 'element-type', name: 'hologram' }]);
  assert.deepEqual(groups.map((g) => g.items[0].name), ['hologram', 'x', 'Inter']);
});

test('preview is drawn from the parsed document, with nothing written', async () => {
  const phone = new FakePhone();
  const exported = await buildSezlabel(fullDocument(phone), phone.exportEnv());
  const parsed = parseSezlabel(exported.bytes, importEnv());
  const preview = previewDocument(parsed) as Rec;
  assert.equal(preview.id, 'preview');
  const image = preview.elements.find((e: Rec) => e.type === 'image');
  assert.ok(image.uri.startsWith('data:image/png;base64,'));
  assert.equal(preview.elements.length, parsed.document.elements.length);
});

test('versions compare numerically', () => {
  assert.ok(compareVersions('1.0.10', '1.0.2') > 0);
  assert.ok(compareVersions('1.0', '1.0.0') === 0);
  assert.ok(compareVersions('0.9.9', '1.0.0') < 0);
});

test('base64 helpers round-trip every length', () => {
  for (let n = 0; n < 40; n++) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) & 255);
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes, `n=${n}`);
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
  }
});

test('import guard keeps freshly written files until released', () => {
  protectImportUris(['a', 'b']);
  assert.deepEqual(protectedImportUris().sort(), ['a', 'b']);
  releaseImportUris(['a']);
  assert.deepEqual(protectedImportUris(), ['b']);
  releaseImportUris(['b']);
  assert.deepEqual(protectedImportUris(), []);
});

test('open note: fonts first, other missing items, nothing when all is fine', () => {
  assert.equal(importNote([], false), null);
  const one = importNote([{ kind: 'font', name: 'Inter' }])!;
  assert.match(one, /a font that is not on this phone: Inter/);
  assert.match(one, /Install it/);
  const two = importNote([{ kind: 'font', name: 'A' }, { kind: 'font', name: 'B' }, { kind: 'clipart', name: 'star' }], true)!;
  assert.match(two, /fonts that are not on this phone: A, B/);
  assert.match(two, /star/);
  assert.match(two, /Ink colours/);
});
