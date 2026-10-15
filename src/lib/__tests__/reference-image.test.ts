import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_ELEMENT_STATE } from '@/components/editor/types';
import { unreferencedManagedFiles } from '@/lib/editor/image-ingest';
import { validateLabelSize } from '@/lib/label-geometry';
import {
  cloneDocument,
  createLabelDocument,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import {
  collectReferenceImageKeepUris,
  isSafeReferenceFileName,
  migrateDocumentReferenceImage,
  referenceImageDisplayUri,
  referenceImageStoredFormat,
  referenceImageStoredFormatFromPick,
  referenceProportionWarns,
  referenceWorkingSize,
  withReferenceImage,
  withoutReferenceImage,
} from '@/lib/reference-image';

function textLabel(): LabelDocument {
  const text: LabelElement = {
    id: 't1',
    type: 'text',
    ...DEFAULT_ELEMENT_STATE,
    text: 'Hello',
    left: 4,
    top: 6,
    width: 20,
    height: 8,
  };
  return createLabelDocument({
    name: 'Guide',
    widthMm: 50,
    heightMm: 30,
    elements: [text],
  });
}

test('a reference image does not change label size or element position', () => {
  const doc = textLabel();
  const next = withReferenceImage(doc, { fileName: 'ref_a.png', widthPx: 1000, heightPx: 600 });
  assert.equal(next.widthMm, 50);
  assert.equal(next.heightMm, 30);
  assert.equal(next.elements[0]?.left, 4);
  assert.equal(next.elements[0]?.top, 6);
  assert.equal(doc.referenceImage, undefined);
  const cloned = cloneDocument(next);
  assert.equal(cloned.referenceImage?.fileName, 'ref_a.png');
  assert.notEqual(cloned, next);
});

test('old labels with no reference image are left untouched', () => {
  const doc = textLabel();
  assert.equal(migrateDocumentReferenceImage(doc), doc);
  assert.equal(doc.elements[0]?.left, 4);
});

test('unsafe reference names are dropped and elements stay', () => {
  const doc = textLabel();
  for (const fileName of ['file:///tmp/a.png', '../secret.png', 'images/ref.png', 'ref:a.png']) {
    const bad = { ...doc, referenceImage: { fileName, widthPx: 10, heightPx: 10 } };
    const next = migrateDocumentReferenceImage(bad);
    assert.equal(next.referenceImage, undefined);
    assert.equal(next.elements, doc.elements);
    assert.equal(next.widthMm, doc.widthMm);
  }
});

test('a safe reference image is kept', () => {
  const doc = withReferenceImage(textLabel(), { fileName: 'ref_ok.png', widthPx: 100, heightPx: 50 });
  assert.equal(migrateDocumentReferenceImage(doc), doc);
  assert.equal(isSafeReferenceFileName('ref_ok.png'), true);
  assert.equal(isSafeReferenceFileName('ref_ok.jpg'), true);
});

test('uploaded label rotation and need printing stay on the reference photo', () => {
  const doc = withReferenceImage(textLabel(), {
    fileName: 'ref_ok.png',
    widthPx: 100,
    heightPx: 50,
    rotation: 90,
    needPrinting: false,
  });
  const next = migrateDocumentReferenceImage(doc);
  assert.equal(next, doc);
  assert.equal(next.referenceImage?.rotation, 90);
  assert.equal(next.referenceImage?.needPrinting, false);
  assert.equal(next.elements.length, 1);
});

test('non-positive pixel sizes are dropped', () => {
  const doc = textLabel();
  const bad = { ...doc, referenceImage: { fileName: 'ref_ok.png', widthPx: 0, heightPx: 10 } };
  const next = migrateDocumentReferenceImage(bad);
  assert.equal(next.referenceImage, undefined);
  assert.equal(next.elements[0]?.top, 6);
});

test('removing the reference image keeps the label size', () => {
  const doc = withReferenceImage(textLabel(), { fileName: 'ref_ok.png', widthPx: 80, heightPx: 40 });
  const next = withoutReferenceImage(doc);
  assert.equal(next.referenceImage, undefined);
  assert.equal(next.widthMm, 50);
  assert.equal(next.elements[0]?.left, 4);
});

test('label size limits stay 8 to 310 mm and the document stores that size', () => {
  assert.equal(validateLabelSize(7.9, 30), 'Minimum size is 8 mm.');
  assert.equal(validateLabelSize(50, 311), 'Maximum size is 310 mm.');
  assert.equal(validateLabelSize(50, 30), null);
  const doc = createLabelDocument({ name: 'Sized', widthMm: 50, heightMm: 30 });
  assert.equal(doc.widthMm, 50);
  assert.equal(doc.heightMm, 30);
  assert.equal(doc.referenceImage, undefined);
});

test('proportion warning starts above 3 percent and fit stays stretch either way', () => {
  assert.equal(referenceProportionWarns(200, 100, 100, 50), false);
  assert.equal(referenceProportionWarns(206, 100, 100, 50), false);
  assert.equal(referenceProportionWarns(207, 100, 100, 50), true);
  assert.equal(referenceProportionWarns(1000, 100, 50, 30), true);
});

test('png and jpg are stored as themselves and heic becomes jpg', () => {
  assert.equal(referenceImageStoredFormat('photo.png'), 'png');
  assert.equal(referenceImageStoredFormat('photo.JPG'), 'jpeg');
  assert.equal(referenceImageStoredFormat('photo.jpeg'), 'jpeg');
  assert.equal(referenceImageStoredFormat('IMG.HEIC'), 'jpeg');
  assert.equal(referenceImageStoredFormat('picture.webp'), null);
  assert.equal(referenceImageStoredFormatFromPick('shot.png', 'file:///tmp/x.heic'), 'png');
  assert.equal(referenceImageStoredFormatFromPick(undefined, 'file:///tmp/x.heic'), 'jpeg');
});

test('the stored guide is capped at 2048 px on the long side', () => {
  const large = referenceWorkingSize(3000, 1500);
  assert.equal(large.downscaled, true);
  assert.equal(large.widthPx, 2048);
  assert.equal(large.heightPx, 1024);
  const small = referenceWorkingSize(800, 400);
  assert.equal(small.downscaled, false);
  assert.equal(small.widthPx, 800);
  assert.equal(small.heightPx, 400);
});

test('a reference file name is kept until no label uses it', () => {
  const keep = collectReferenceImageKeepUris([
    { referenceImage: { fileName: 'ref_a.png', widthPx: 10, heightPx: 10 } },
    { referenceImage: { fileName: '../nope.png', widthPx: 10, heightPx: 10 } },
  ]);
  assert.deepEqual(keep, ['sezprint/images/ref_a.png']);
  const stale = unreferencedManagedFiles(['ref_a.png', 'ref_b.png'], keep);
  assert.deepEqual(stale, ['ref_b.png']);
});

test('display uri is the app images folder plus the file name', () => {
  assert.equal(
    referenceImageDisplayUri('ref_ok.png', 'file:///docs/'),
    'file:///docs/sezprint/images/ref_ok.png',
  );
  assert.equal(referenceImageDisplayUri('../x.png', 'file:///docs/'), null);
  assert.equal(referenceImageDisplayUri('ref_ok.png', null), null);
});
