import assert from 'node:assert/strict';
import test from 'node:test';

import { decode as decodePng } from 'fast-png';

import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { clearImageTiles, prepareImageTiles, setImageTileDecoder } from '@/printing/raster/image-tiles';
import { canHeadlessRasterPrint, rasterizeDocumentToBitmap } from '@/printing/raster/skia-rasterizer';
import { hashGray } from '@/printing/raster/image-modes';
import { buildSezlabel } from '../export';
import { finalizeDocument } from '../finalize';
import { parseSezlabel } from '../import';
import { FakePhone, allElements, fakePlacement, importEnv, makeJpeg, makePng } from './fixtures';

type Rec = Record<string, any>;
const DPI = 203;

function raster(doc: LabelDocument, dpi = DPI) {
  return rasterizeDocumentToBitmap(doc, dpi, { threshold: 160, backend: 'dot-buffer' });
}

async function viaFile(doc: LabelDocument, sender: FakePhone) {
  const exported = await buildSezlabel(doc, sender.exportEnv());
  const parsed = parseSezlabel(exported.bytes, importEnv());
  const receiver = new FakePhone();
  const imported = finalizeDocument(parsed, { ...fakePlacement(parsed as never, receiver), name: doc.name });
  return { imported, receiver };
}

const headlessTypes = ['text', 'barcode', 'qrcode', 'line', 'shape', 'border'];

function headlessDoc(): LabelDocument {
  const sender = new FakePhone();
  const els = allElements('x', 'y')
    .filter((e) => headlessTypes.includes(e.type))
    .map((e, i) => ({ ...e, rotation: 0, left: 3 + i * 2, top: 3 + i * 7, zIndex: i, visible: true, opacity: 1 }) as LabelElement);
  void sender;
  return {
    id: 'raster', name: 'raster', widthMm: 100, heightMm: 60, orientation: 0, paperType: 'Label', mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' }, groupId: null, createdAt: 1, updatedAt: 1, elements: els,
    // Printer settings on the sender must not matter to the portable raster.
    settings: { hOffsetMm: 0.4, vOffsetMm: 0.2, printDarkness: 7, flipHorizontally: false },
  } as unknown as LabelDocument;
}

test('raster: text, barcode, QR, line, shape and border print the same after export → import (203 and 300 dpi)', async () => {
  const sender = new FakePhone();
  const doc = headlessDoc();
  assert.equal(canHeadlessRasterPrint(doc), true, 'fixture must be drawable by the headless path');
  const { imported } = await viaFile(doc, sender);
  for (const dpi of [203, 300]) {
    const a = raster(doc, dpi);
    const b = raster(imported, dpi);
    assert.equal(a.widthDots, b.widthDots);
    assert.equal(a.heightDots, b.heightDots);
    assert.equal(hashGray(a.mono1bppBuffer), hashGray(b.mono1bppBuffer), `dpi ${dpi}`);
    // Not vacuous: the page has ink.
    assert.ok(a.mono1bppBuffer.some((byte) => byte !== 0xff), 'the label draws something');
  }
});

test('raster: the test can tell labels apart (moving one element changes the bytes)', async () => {
  const doc = headlessDoc();
  const moved = JSON.parse(JSON.stringify(doc)) as LabelDocument;
  moved.elements[0].left += 2;
  assert.notEqual(hashGray(raster(doc).mono1bppBuffer), hashGray(raster(moved).mono1bppBuffer));
});

test('raster: an imported label does not read the sender printer settings (portable raster)', async () => {
  const sender = new FakePhone();
  const doc = headlessDoc();
  const { imported } = await viaFile(doc, sender);
  const neutral = JSON.parse(JSON.stringify(doc)) as Rec;
  delete neutral.settings;
  assert.equal(hashGray(raster(imported).mono1bppBuffer), hashGray(raster(neutral as LabelDocument).mono1bppBuffer));
  assert.equal((imported as Rec).settings, undefined);
});

function grayOf(bytes: Uint8Array) {
  const png = decodePng(bytes);
  const gray = new Uint8Array(png.width * png.height);
  for (let i = 0; i < gray.length; i++) gray[i] = (png.data as Uint8Array)[i * png.channels];
  return { gray, width: png.width, height: png.height };
}

function imageDoc(printUri: string, workingUri: string, mode: string): LabelDocument {
  const [el] = allElements(printUri, workingUri).filter((e) => e.type === 'image');
  const image = {
    ...el, left: 4, top: 3, width: 30, height: 20, rotation: 0, contentFit: 'fill', flipH: false, flipV: false, tile: false,
    colorMode: 'Original', imageMode: mode, threshold: 120, brightness: 0, contrast: 0, invert: false, antiColor: false,
    zIndex: 0, visible: true, opacity: 1,
  } as LabelElement;
  return {
    id: 'img', name: 'img', widthMm: 50, heightMm: 30, orientation: 0, paperType: 'Label', groupId: null, createdAt: 1, updatedAt: 1,
    elements: [image],
  } as unknown as LabelDocument;
}

test('image print raster is identical: only the print copy ships and the working copy is rebuilt', async () => {
  for (const mode of ['solid', 'floyd', 'atkinson', 'ordered']) {
    const sender = new FakePhone();
    const printUri = sender.put('file:///sender/print.png', makePng(90, 60, 4));
    const workingUri = sender.put('file:///sender/preview.jpg', makeJpeg(45, 30));
    const doc = imageDoc(printUri, workingUri, mode);
    const { imported, receiver } = await viaFile(doc, sender);

    const img = imported.elements[0] as Rec;
    assert.notEqual(img.uri, img.printUri, 'working copy is a different, rebuilt file');
    assert.deepEqual(receiver.files.get(img.printUri), sender.files.get(printUri), 'print copy bytes identical');

    // The decoder resolves whichever phone owns the file. Anything but the print copy would decode to nothing.
    setImageTileDecoder(async (uri) => {
      const bytes = receiver.files.get(uri) ?? sender.files.get(uri);
      if (!bytes || !uri.includes('print')) return null;
      return grayOf(bytes);
    });
    clearImageTiles();
    await prepareImageTiles(doc, DPI);
    const before = raster(doc);
    clearImageTiles();
    await prepareImageTiles(imported, DPI);
    const after = raster(imported);
    assert.equal(hashGray(before.mono1bppBuffer), hashGray(after.mono1bppBuffer), mode);
    assert.ok(before.mono1bppBuffer.some((b) => b !== 0xff), `${mode} draws ink`);

    // Sensitivity: a different print picture gives different bytes.
    const other = JSON.parse(JSON.stringify(imported)) as Rec;
    other.elements[0].id = 'other-picture'; // the dot renderer memoises per element
    other.elements[0].printUri = receiver.put('file:///recv/sezprint/images/other-print.png', makePng(90, 60, 9));
    clearImageTiles();
    await prepareImageTiles(other as LabelDocument, DPI);
    assert.notEqual(hashGray(raster(other as LabelDocument).mono1bppBuffer), hashGray(before.mono1bppBuffer), `${mode} sensitivity`);
  }
  setImageTileDecoder(null);
  clearImageTiles();
});
