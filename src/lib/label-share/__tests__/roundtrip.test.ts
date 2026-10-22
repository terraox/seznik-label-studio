import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ARCTEXT_STATE,
  DEFAULT_BARCODE_STATE,
  DEFAULT_DEGREES_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
  DEFAULT_TIME_STATE,
  createTableState,
} from '@/components/editor/types';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { buildSezlabel } from '../export';
import { finalizeDocument, uniqueLabelName } from '../finalize';
import { parseSezlabel } from '../import';
import { ELEMENT_SPECS, KNOWN_ELEMENT_TYPES, forEachElement } from '../schema';
import { sha256Hex } from '../sha256';
import { readZip } from '../zip';
import { ALL_TYPES, FakePhone, SAFE_SVG, fakePlacement, fullDocument, importEnv, makeFont, makeJpeg, makePng } from './fixtures';

type Rec = Record<string, any>;

async function roundTrip(doc: LabelDocument, sender: FakePhone, exportOver = {}) {
  const exported = await buildSezlabel(doc, sender.exportEnv(exportOver));
  const parsed = parseSezlabel(exported.bytes, importEnv());
  const receiver = new FakePhone();
  const placement = fakePlacement(parsed as never, receiver);
  const imported = finalizeDocument(parsed, { ...placement, name: doc.name });
  return { exported, parsed, imported, receiver };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Comparable form: ids and file locations replaced by content hashes. */
function canon(docIn: LabelDocument, files: Map<string, Uint8Array>, clipartLabel: (id: string) => string): Rec {
  const doc = clone(docIn) as Rec;
  for (const k of ['id', 'groupId', 'createdAt', 'updatedAt', 'schemaVersion']) delete doc[k];
  const hash = (uri: string) => `sha:${sha256Hex(files.get(uri) ?? new Uint8Array([0]))}`;
  forEachElement(doc as never, (el: Rec) => {
    el.id = '_';
    if (el.type === 'image') {
      if (el.printUri) el.printUri = hash(el.printUri);
      delete el.uri;
      delete el.workingWidthPx;
      delete el.workingHeightPx;
    }
    if (el.type === 'clipart') el.clipartId = clipartLabel(el.clipartId);
  });
  if (doc.background?.type === 'image') doc.background.uri = hash(doc.background.uri);
  if (doc.referenceImage) doc.referenceImage.fileName = '_ref';
  return doc;
}

/** What the file is supposed to keep of the sender's original. */
function expectedFromOriginal(orig: LabelDocument): LabelDocument {
  const doc = clone(orig) as Rec;
  const IN = ['mirrorMode', 'flagLabel', 'mirrorRowsCount', 'mirrorSpacingMm', 'mirrorRowNumber', 'antiColor', 'defaultDrawingColorIndex'];
  if (doc.settings) {
    doc.settings = Object.fromEntries(Object.entries(doc.settings).filter(([k]) => IN.includes(k)));
  }
  if (doc.bulk) {
    delete doc.bulk.excelFileId;
    delete doc.bulk.rowCopiesOverrides;
    doc.bulk.rowContentOverrides = {};
    doc.bulk.activeRowIndex = 0;
  }
  return doc as LabelDocument;
}

function userLabel(id: string): string {
  return id === 'svg_user1' || id === 'svg_new_svg_user1' ? 'user:star' : id;
}

test('full document: every setting of all 13 element types survives export → import', async () => {
  const sender = new FakePhone();
  const doc = fullDocument(sender);
  const { imported, receiver, parsed } = await roundTrip(doc, sender);

  // Every type is really in the fixture.
  const present = new Set(doc.elements.map((e) => e.type));
  assert.deepEqual([...present].sort(), [...ALL_TYPES].sort());

  const want = canon(expectedFromOriginal(doc), sender.files, userLabel);
  const got = canon(imported, receiver.files, userLabel);
  assert.deepEqual(got, want);
  assert.equal(parsed.missing.filter((m) => m.kind !== 'font').length, 0, JSON.stringify(parsed.missing));
});

test('layer order is kept exactly: array order and zIndex, border not moved to the bottom', async () => {
  const sender = new FakePhone();
  const doc = fullDocument(sender);
  const { imported } = await roundTrip(doc, sender);
  assert.deepEqual(
    imported.elements.map((e) => [e.type, e.zIndex]),
    doc.elements.map((e) => [e.type, e.zIndex]),
  );
});

test('each element type on its own round-trips with its own fields', async () => {
  for (const type of ALL_TYPES) {
    const sender = new FakePhone();
    const full = fullDocument(sender);
    const el = full.elements.find((e) => e.type === type)!;
    const doc: LabelDocument = {
      id: 'l', name: type, widthMm: 100, heightMm: 60, orientation: 0, paperType: 'Label',
      elements: [el], groupId: null, createdAt: 1, updatedAt: 1,
    };
    const { imported, receiver } = await roundTrip(doc, sender);
    assert.equal(imported.elements.length, 1, type);
    assert.deepEqual(canon(imported, receiver.files, userLabel), canon(expectedFromOriginal(doc), sender.files, userLabel), type);
  }
});

test('schema drift guard: every field the app defines for an element is in the import schema', () => {
  const needSpec = (type: string, keys: string[], extra: string[] = []) => {
    const spec = new Set([...Object.keys(ELEMENT_SPECS[type]), ...extra]);
    for (const key of keys) assert.ok(spec.has(key), `${type}: schema lacks "${key}" (add it to src/lib/label-share/schema.ts)`);
  };
  needSpec('text', Object.keys(DEFAULT_ELEMENT_STATE), ['serial']);
  needSpec('barcode', Object.keys(DEFAULT_BARCODE_STATE), ['serial']);
  needSpec('qrcode', Object.keys(DEFAULT_QRCODE_STATE), ['serial']);
  needSpec('line', Object.keys(DEFAULT_LINE_STATE));
  needSpec('shape', Object.keys(DEFAULT_SHAPE_STATE));
  needSpec('time', Object.keys(DEFAULT_TIME_STATE));
  needSpec('arctext', Object.keys(DEFAULT_ARCTEXT_STATE), ['serial']);
  needSpec('degrees', Object.keys(DEFAULT_DEGREES_STATE), ['serial']);
  needSpec('table', Object.keys(createTableState(2, 3)), ['rowHeights', 'columnWidths', 'cells']);
  // Types with no DEFAULT_* constant: the exhaustive key lists below fail `tsc` when the app adds a field.
  const imageKeys: Record<keyof Extract<LabelElement, { type: 'image' }>, true> = {
    id: true, type: true, uri: true, rotation: true, left: true, top: true, width: true, height: true, lockMovement: true,
    needPrinting: true, antiColor: true, flipH: true, flipV: true, contentFit: true, colorMode: true, grayThreshold: true,
    tile: true, contentType: true, columnNameContent: true, aspectRatioLocked: true, originalAspect: true, printUri: true,
    workingWidthPx: true, workingHeightPx: true, fitLabelSource: true, imageMode: true, threshold: true, brightness: true,
    contrast: true, invert: true, opacity: true, zIndex: true, visible: true,
  };
  needSpec('image', Object.keys(imageKeys).filter((k) => !['id', 'type', 'uri', 'printUri', 'workingWidthPx', 'workingHeightPx'].includes(k)));
  const clipartKeys: Record<keyof Extract<LabelElement, { type: 'clipart' }>, true> = {
    id: true, type: true, clipartId: true, symbol: true, glyph: true, rotation: true, left: true, top: true, width: true,
    height: true, lockMovement: true, needPrinting: true, drawingColorIndex: true, tile: true, colorMode: true,
    grayThreshold: true, strokeScale: true, opacity: true, zIndex: true, visible: true,
  };
  needSpec('clipart', Object.keys(clipartKeys).filter((k) => !['id', 'type', 'clipartId'].includes(k)));
  const borderKeys: Record<keyof Extract<LabelElement, { type: 'border' }>, true> = {
    id: true, type: true, borderStyle: true, lineWidth: true, rotation: true, left: true, top: true, width: true, height: true,
    lockMovement: true, needPrinting: true, drawingColorIndex: true, geometryVersion: true, edgeGapMm: true, opacity: true,
    zIndex: true, visible: true,
  };
  needSpec('border', Object.keys(borderKeys).filter((k) => !['id', 'type', 'borderStyle'].includes(k)));
  const signatureKeys: Record<keyof Extract<LabelElement, { type: 'signature' }>, true> = {
    id: true, type: true, strokes: true, rotation: true, left: true, top: true, width: true, height: true, lockMovement: true,
    needPrinting: true, drawingColorIndex: true, colorMode: true, grayThreshold: true, opacity: true, zIndex: true, visible: true,
  };
  needSpec('signature', Object.keys(signatureKeys).filter((k) => !['id', 'type', 'strokes'].includes(k)));
  assert.deepEqual([...KNOWN_ELEMENT_TYPES].sort(), [...ALL_TYPES].sort());

  // The fixture itself must exercise every schema key of every type (so a new key needs a new fixture value).
  const sender = new FakePhone();
  const els = fullDocument(sender).elements as unknown as Rec[];
  for (const type of ALL_TYPES) {
    const keys = new Set(Object.keys(els.find((e) => e.type === type)!));
    for (const key of Object.keys(ELEMENT_SPECS[type])) {
      if (type === 'image' && ['uri', 'printUri'].includes(key)) continue;
      assert.ok(keys.has(key), `fixture ${type} lacks "${key}"`);
    }
  }
});

test('nothing is repositioned or resized: elements outside the label stay where they are', async () => {
  const sender = new FakePhone();
  const full = fullDocument(sender);
  const text = clone(full.elements[0]) as Rec;
  Object.assign(text, { left: 150.123, top: -20.5, width: 500, height: 0.5, rotation: 45 });
  const doc: LabelDocument = { ...full, elements: [text as LabelElement], ups: undefined, bulk: undefined };
  const { imported } = await roundTrip(doc, sender);
  const out = imported.elements[0] as Rec;
  assert.equal(out.left, 150.123);
  assert.equal(out.top, -20.5);
  assert.equal(out.width, 500);
  assert.equal(out.height, 0.5);
  assert.equal(out.rotation, 45); // wrapped to 0..360 only, never snapped
});

test('only out-of-range VALUES are clamped; the element itself is kept', async () => {
  const sender = new FakePhone();
  const full = fullDocument(sender);
  const text = clone(full.elements[0]) as Rec;
  Object.assign(text, { left: 99999, fontSize: 5000, opacity: 7, rotation: -90 });
  const doc: LabelDocument = { ...full, elements: [text as LabelElement], ups: undefined, bulk: undefined };
  const { imported } = await roundTrip(doc, sender);
  const out = imported.elements[0] as Rec;
  assert.equal(out.left, 1000);
  assert.equal(out.fontSize, 400);
  assert.equal(out.opacity, 1);
  assert.equal(out.rotation, 270);
});

test('idempotence: export is byte-stable and export(import(export(x))) carries the same label', async () => {
  const sender = new FakePhone();
  const doc = fullDocument(sender);
  const a = await buildSezlabel(doc, sender.exportEnv());
  const b = await buildSezlabel(doc, sender.exportEnv());
  assert.equal(sha256Hex(a.bytes), sha256Hex(b.bytes), 'same input, same bytes');

  const parsed1 = parseSezlabel(a.bytes, importEnv());
  const receiver = new FakePhone();
  // The receiver's user clipart now exists under its new id.
  receiver.userClipart.set('svg_new_svg_user1', { id: 'svg_new_svg_user1', label: 'My star', kind: 'svg', svg: SAFE_SVG });
  const imported = finalizeDocument(parsed1, { ...fakePlacement(parsed1 as never, receiver), name: doc.name });
  const second = await buildSezlabel(imported, receiver.exportEnv());
  const parsed2 = parseSezlabel(second.bytes, importEnv());

  const c1 = canon(parsed1.document as never, new Map([...parsed1.assets].map(([k, v]) => [k, v.bytes])), userLabel);
  const c2 = canon(parsed2.document as never, new Map([...parsed2.assets].map(([k, v]) => [k, v.bytes])), userLabel);
  // Asset paths are content-addressed, so equal pictures have equal paths in both exports.
  assert.deepEqual(parsed1.manifest.dataColumns, parsed2.manifest.dataColumns);
  assert.deepEqual([...parsed1.assets.keys()].sort(), [...parsed2.assets.keys()].sort());
  assert.deepEqual(c2, c1);
});

test('settings-neutral: printer settings never reach the file and the saved label has only design settings', async () => {
  const sender = new FakePhone();
  const doc = fullDocument(sender);
  const exported = await buildSezlabel(doc, sender.exportEnv());
  const entries = readZip(exported.bytes);
  const documentText = new TextDecoder().decode(entries.get('document.json')!);
  const manifestText = new TextDecoder().decode(entries.get('manifest.json')!);
  for (const key of [
    'gapLengthMm', 'flipHorizontally', 'printGrid', 'printGridSpacingMm', 'printRuler', 'printDarkness', 'printSpeed',
    'hOffsetMm', 'vOffsetMm', 'elementsOffsetXMm', 'elementsOffsetYMm', 'borderOffsetXMm', 'borderOffsetYMm', 'dataSourceFileId',
    'excelFileId', 'rowContentOverrides', 'rowCopiesOverrides',
  ]) {
    assert.ok(!documentText.includes(`"${key}"`), `document.json must not contain ${key}`);
  }
  // Privacy sentinel: no spreadsheet cell text anywhere in the inflated parts.
  for (const [path, data] of entries) {
    assert.ok(!new TextDecoder('latin1').decode(data).includes('SECRET-PHONE'), `${path} leaked a cell`);
  }
  assert.ok(!documentText.includes('xls_secret') && !manifestText.includes('xls_secret'));
  assert.ok(!documentText.includes('group_1') && !documentText.includes('label_sender'));

  const parsed = parseSezlabel(exported.bytes, importEnv());
  const receiver = new FakePhone();
  const imported = finalizeDocument(parsed, { ...fakePlacement(parsed as never, receiver), name: 'x' }) as Rec;
  assert.deepEqual(Object.keys(imported.settings).sort(), [
    'antiColor', 'defaultDrawingColorIndex', 'flagLabel', 'mirrorMode', 'mirrorRowNumber', 'mirrorRowsCount', 'mirrorSpacingMm',
  ]);
  assert.equal('excelFileId' in imported.bulk, false);
  assert.deepEqual(imported.bulk.rowContentOverrides, {});
  assert.equal(imported.groupId, null);
  assert.equal(imported.id, 'label_new');
  assert.deepEqual(parsed.bulkColumns, ['Name']);
});

test('manifest records the palette and the known Default-font limit', async () => {
  const sender = new FakePhone();
  const { exported } = await roundTrip(fullDocument(sender), sender);
  const manifest = JSON.parse(new TextDecoder().decode(readZip(exported.bytes).get('manifest.json')!));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.includesData, false);
  assert.equal(manifest.palette.length, 6);
  assert.ok(manifest.knownLimits.some((l: string) => l.includes("'Default' font")));
  assert.ok(manifest.notShared.includes('printer'));
});

test('changed palette is detected', async () => {
  const sender = new FakePhone();
  const exported = await buildSezlabel(fullDocument(sender), sender.exportEnv());
  const parsed = parseSezlabel(exported.bytes, importEnv({ palette: ['#000000', '#111111', '#222222'] }));
  assert.equal(parsed.paletteChanged, true);
  assert.equal(parseSezlabel(exported.bytes, importEnv()).paletteChanged, false);
});

test('missing items are listed, never fatal: unknown element type, clipart id, border style, font', async () => {
  const sender = new FakePhone();
  const full = fullDocument(sender);
  const futureEl = { id: 'f1', type: 'hologram', left: 1, top: 1, width: 2, height: 2 } as unknown as LabelElement;
  const doc: LabelDocument = {
    ...full,
    ups: undefined,
    bulk: undefined,
    elements: [
      ...full.elements.filter((e) => ['text', 'clipart', 'border'].includes(e.type)),
      futureEl,
      { ...(full.elements.find((e) => e.type === 'clipart' && e.clipartId === 'builtin-star') as object), id: 'c9', clipartId: 'future-heart' } as LabelElement,
      { ...(full.elements.find((e) => e.type === 'border') as object), id: 'b9', borderStyle: 'neon-zigzag' } as unknown as LabelElement,
    ],
  };
  const { parsed, imported } = await roundTrip(doc, sender);
  const names = (kind: string) => parsed.missing.filter((m) => m.kind === kind).map((m) => m.name);
  assert.deepEqual(names('element-type'), ['hologram']);
  assert.deepEqual(names('clipart'), ['future-heart']);
  assert.deepEqual(names('border-style'), ['neon-zigzag']);
  assert.deepEqual(names('font'), []); // Inter, Default and Barcode exist on the fake receiver
  // The unknown clipart element is kept (its id survives for a later update); the unknown type is skipped.
  assert.ok(imported.elements.some((e) => e.type === 'clipart' && (e as Rec).clipartId === 'future-heart'));
  assert.ok(!imported.elements.some((e) => (e as Rec).type === 'hologram'));

  const noInter = parseSezlabel((await buildSezlabel(doc, sender.exportEnv())).bytes, importEnv({ isFontAvailable: (n) => n === 'Default' || n === 'Barcode' }));
  assert.deepEqual(noInter.missing.filter((m) => m.kind === 'font').map((m) => m.name), ['Inter']);
  // The stored font name is kept for text, so installing the font later fixes it.
  assert.equal((noInter.document.elements.find((e) => e.type === 'text') as Rec).fontFamily, 'Inter');
});

test('same name gets " (2)", then " (3)"', () => {
  assert.equal(uniqueLabelName('Shelf tag', ['Other']), 'Shelf tag');
  assert.equal(uniqueLabelName('Shelf tag', ['shelf tag']), 'Shelf tag (2)');
  assert.equal(uniqueLabelName('Shelf tag', ['Shelf tag', 'Shelf tag (2)']), 'Shelf tag (3)');
});

test('images: only the print copy ships, identical bytes arrive, duplicates are stored once', async () => {
  const sender = new FakePhone();
  const full = fullDocument(sender);
  const image = full.elements.find((e) => e.type === 'image') as Rec;
  const twin = { ...clone(image), id: 'i2', left: 40 } as LabelElement;
  const doc: LabelDocument = { ...full, ups: undefined, bulk: undefined, elements: [image as LabelElement, twin] };
  const exported = await buildSezlabel(doc, sender.exportEnv());
  const entries = readZip(exported.bytes);
  const pictures = [...entries.keys()].filter((p) => p.startsWith('assets/images/'));
  // print copy + background + reference photo; the 32x16 working copy is not shipped; the twin shares the print copy.
  assert.equal(pictures.length, 3);
  const jpgShipped = [...entries.entries()].some(([p, d]) => p.endsWith('.jpg') && d.length === sender.files.get(image.uri)!.length);
  assert.equal(jpgShipped, false);
  const { parsed, imported, receiver } = await roundTrip(doc, sender);
  const imgs = imported.elements.filter((e) => e.type === 'image') as Rec[];
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].printUri, imgs[1].printUri);
  assert.deepEqual(receiver.files.get(imgs[0].printUri), sender.files.get(image.printUri));
  assert.notEqual(imgs[0].uri, imgs[0].printUri, 'working copy is rebuilt separately');
  assert.equal(parsed.missing.filter((m) => m.kind === 'image').length, 0);
});

test('an image whose file is gone is skipped and listed, not fatal', async () => {
  const sender = new FakePhone();
  const full = fullDocument(sender);
  sender.files.delete((full.elements.find((e) => e.type === 'image') as Rec).printUri);
  const { parsed, imported, exported } = await roundTrip(full, sender);
  assert.ok(exported.summary.skipped.some((s) => s.includes('picture')));
  assert.ok(parsed.missing.some((m) => m.kind === 'image'));
  assert.ok(!imported.elements.some((e) => e.type === 'image'));
});

test('user clipart can be left out by choice', async () => {
  const sender = new FakePhone();
  const full = fullDocument(sender);
  const { parsed } = await roundTrip(full, sender, { includeUserClipart: false });
  assert.ok(parsed.missing.some((m) => m.kind === 'clipart' && m.name === 'svg_user1'));
  assert.equal(parsed.userClipart.length, 0);
});

test('unsafe template outline is dropped and listed', async () => {
  const sender = new FakePhone();
  const full = fullDocument(sender);
  const exported = await buildSezlabel({ ...full, templateSvg: { xml: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' } }, sender.exportEnv());
  assert.ok(exported.summary.skipped.some((s) => s.includes('outline')));
  const parsed = parseSezlabel(exported.bytes, importEnv());
  assert.equal((parsed.document as Rec).templateSvg, undefined);
  assert.equal(readZip(exported.bytes).has('document.json'), true);
});

test('a file with no pictures but a JPEG user clipart still works', async () => {
  const sender = new FakePhone();
  sender.userClipart.set('svg_j', { id: 'svg_j', label: 'Logo', kind: 'image', bytes: makeJpeg(30, 20) });
  const doc: LabelDocument = {
    id: 'l', name: 'j', widthMm: 50, heightMm: 30, orientation: 0, paperType: 'Label', groupId: null, createdAt: 1, updatedAt: 1,
    elements: [{ id: 'c', type: 'clipart', clipartId: 'svg_j', left: 1, top: 1, width: 5, height: 5, rotation: 0, lockMovement: false, needPrinting: true, drawingColorIndex: 1 } as LabelElement],
  };
  const { parsed } = await roundTrip(doc, sender);
  assert.equal(parsed.userClipart.length, 1);
  assert.equal(parsed.userClipart[0].widthPx, 30);
  void makePng;
});

test('fonts: the user\'s own fonts are packed by default; names always travel', async () => {
  const sender = new FakePhone();
  const doc = fullDocument(sender);
  sender.importedFonts.set('Inter', makeFont('ttf', 700));
  const exported = await buildSezlabel(doc, sender.exportEnv());
  assert.equal(exported.summary.fontFiles, 1);
  const entries = readZip(exported.bytes);
  const fontPaths = [...entries.keys()].filter((p) => p.startsWith('assets/fonts/'));
  assert.equal(fontPaths.length, 1);
  assert.match(fontPaths[0], /\.ttf$/);
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')!));
  assert.deepEqual(manifest.fontFiles, [{ family: 'Inter', path: fontPaths[0] }]);
  assert.ok(manifest.fonts.some((f: Rec) => f.family === 'Inter'));
  const parsed = parseSezlabel(exported.bytes, importEnv({ isFontAvailable: (n) => n === 'Default' || n === 'Barcode' }));
  assert.deepEqual(parsed.fonts.map((f) => [f.family, f.ext, f.bytes.length]), [['Inter', 'ttf', 700]]);
  assert.equal(parsed.missing.filter((m) => m.kind === 'font').length, 0);
});

test('fonts: switch off leaves them out and lists them; built-in or downloaded fonts are never packed', async () => {
  const sender = new FakePhone();
  const doc = fullDocument(sender);
  sender.importedFonts.set('Inter', makeFont('ttf', 700));
  const off = await buildSezlabel(doc, sender.exportEnv({ includeFonts: false }));
  assert.equal(off.summary.fontFiles, 0);
  assert.ok(off.summary.skipped.some((s) => s.includes('font "Inter"')));
  const parsed = parseSezlabel(off.bytes, importEnv({ isFontAvailable: (n) => n === 'Default' || n === 'Barcode' }));
  assert.deepEqual(parsed.missing.filter((m) => m.kind === 'font').map((m) => m.name), ['Inter']);
  // No imported-font bytes known on this phone (built-in / downloaded): nothing is packed.
  const plain = new FakePhone();
  const none = await buildSezlabel(fullDocument(plain), plain.exportEnv());
  assert.equal(none.summary.fontFiles, 0);
});

test('fonts: a bad font file is skipped on export, with a note', async () => {
  const sender = new FakePhone();
  const doc = fullDocument(sender);
  sender.importedFonts.set('Inter', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]));
  const out = await buildSezlabel(doc, sender.exportEnv());
  assert.equal(out.summary.fontFiles, 0);
  assert.ok(out.summary.skipped.some((s) => /usable/.test(s)));
});
