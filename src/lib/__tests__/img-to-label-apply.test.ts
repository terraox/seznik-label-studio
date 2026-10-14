import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFitLabelDocument,
  placeFitLabelImageMm,
  type FitLabelIngestedImage,
} from '@/lib/img-to-label-document';

function ingested(widthPx: number, heightPx: number): FitLabelIngestedImage {
  return {
    previewUri: 'file:///preview.jpg',
    printUri: 'file:///print.png',
    widthPx,
    heightPx,
    workingWidthPx: widthPx,
    workingHeightPx: heightPx,
    originalAspect: widthPx / heightPx,
  };
}

test('contain placement letterboxes a landscape crop on a portrait label', () => {
  const placed = placeFitLabelImageMm(50, 100, 200, 100, 'contain');
  assert.equal(placed.contentFit, 'contain');
  assert.equal(placed.aspectRatioLocked, true);
  assert.ok(Math.abs(placed.width - 50) < 1e-6);
  assert.ok(Math.abs(placed.height - 25) < 1e-6);
  assert.ok(Math.abs(placed.left) < 1e-6);
  assert.ok(Math.abs(placed.top - 37.5) < 1e-6);
});

test('contain placement letterboxes a portrait crop on a landscape label', () => {
  const placed = placeFitLabelImageMm(100, 50, 100, 200, 'contain');
  assert.equal(placed.contentFit, 'contain');
  assert.ok(Math.abs(placed.height - 50) < 1e-6);
  assert.ok(Math.abs(placed.width - 25) < 1e-6);
  assert.ok(Math.abs(placed.top) < 1e-6);
  assert.ok(Math.abs(placed.left - 37.5) < 1e-6);
});

test('cover fills the pad and stretch unlocks aspect', () => {
  const cover = placeFitLabelImageMm(80, 50, 10, 10, 'cover');
  assert.deepEqual(cover, {
    left: 0,
    top: 0,
    width: 80,
    height: 50,
    contentFit: 'cover',
    aspectRatioLocked: true,
  });
  const stretch = placeFitLabelImageMm(80, 50, 10, 10, 'stretch');
  assert.equal(stretch.contentFit, 'fill');
  assert.equal(stretch.aspectRatioLocked, false);
  assert.equal(stretch.width, 80);
  assert.equal(stretch.height, 50);
});

test('buildFitLabelDocument stores the selected millimetre size', () => {
  const doc = buildFitLabelDocument({
    widthMm: 101.6,
    heightMm: 152.4,
    ingested: ingested(400, 600),
    fitMode: 'contain',
  });
  assert.equal(doc.widthMm, 101.6);
  assert.equal(doc.heightMm, 152.4);
  assert.equal(doc.elements.length, 1);
  const el = doc.elements[0];
  assert.equal(el?.type, 'image');
  if (el?.type === 'image') {
    assert.equal(el.printUri, 'file:///print.png');
    assert.equal(el.uri, 'file:///preview.jpg');
  }
});

test('document contentFit follows contain, cover, and stretch', () => {
  const contain = buildFitLabelDocument({
    widthMm: 40,
    heightMm: 80,
    ingested: ingested(200, 100),
    fitMode: 'contain',
  }).elements[0];
  const cover = buildFitLabelDocument({
    widthMm: 40,
    heightMm: 80,
    ingested: ingested(200, 100),
    fitMode: 'cover',
  }).elements[0];
  const stretch = buildFitLabelDocument({
    widthMm: 40,
    heightMm: 80,
    ingested: ingested(200, 100),
    fitMode: 'stretch',
  }).elements[0];

  assert.equal(contain?.type, 'image');
  assert.equal(cover?.type, 'image');
  assert.equal(stretch?.type, 'image');
  if (contain?.type === 'image') {
    assert.equal(contain.contentFit, 'contain');
    assert.equal(contain.aspectRatioLocked, true);
  }
  if (cover?.type === 'image') assert.equal(cover.contentFit, 'cover');
  if (stretch?.type === 'image') {
    assert.equal(stretch.contentFit, 'fill');
    assert.equal(stretch.aspectRatioLocked, false);
  }
});
