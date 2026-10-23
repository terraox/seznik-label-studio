import assert from 'node:assert/strict';
import test from 'node:test';

import { JOSH_GAP_TYPE } from '@/lib/printer/josh-print';
import {
  clampJoshGapMm,
  joshMediaForPaperType,
  resolveJoshJobParams,
} from '@/lib/printer/josh-job-params';
import { joshGapLength01mm } from '@/lib/printer/paper-type';

test('omitted density and speed stay LPAPI −1 (printer default)', () => {
  const job = resolveJoshJobParams({ paperType: 'Label', gapMm: 3 });
  assert.equal(job.density, -1);
  assert.equal(job.speed, -1);
  assert.equal(job.media, 'gap');
  assert.equal(job.gapType, JOSH_GAP_TYPE.label);
  assert.equal(job.gapMm, 3);
});

test('resolved Auto 10/3 passes through; gap clamps 0–20 mm', () => {
  const auto = resolveJoshJobParams({ paperType: 'Label', gapMm: 3, density: 10, speed: 3 });
  assert.equal(auto.density, 10);
  assert.equal(auto.speed, 3);
  assert.equal(auto.gapMm, 3);
  assert.equal(clampJoshGapMm(-1), 0);
  assert.equal(clampJoshGapMm(25), 20);
  assert.equal(clampJoshGapMm(2.256), 2.26);
});

test('paper type maps to LPAPI GAP_TYPE; receipt zeros gap millimetres', () => {
  assert.equal(joshMediaForPaperType('Receipt'), 'continuous');
  assert.equal(joshMediaForPaperType('Black mark'), 'gap');
  assert.equal(joshMediaForPaperType('Label'), 'gap');
  assert.equal(joshMediaForPaperType('Transparent'), 'hole');
  assert.equal(joshMediaForPaperType('Cardstock'), 'bline');

  const receipt = resolveJoshJobParams({ paperType: 'Receipt', gapMm: 3, density: 12, speed: 4 });
  assert.equal(receipt.media, 'continuous');
  assert.equal(receipt.gapType, JOSH_GAP_TYPE.receipt);
  assert.equal(receipt.gapMm, 0);
  assert.equal(receipt.density, 12);
  assert.equal(receipt.speed, 4);

  const clamped = resolveJoshJobParams({ paperType: 'Label', density: 20, speed: 8 });
  assert.equal(clamped.density, 14);
  assert.equal(clamped.speed, 4);
  const floor = resolveJoshJobParams({ paperType: 'Label', density: -3, speed: 0 });
  assert.equal(floor.density, 0);
  assert.equal(floor.speed, 1);

  const mark = resolveJoshJobParams({ paperType: 'Black mark', gapMm: 3.5 });
  assert.equal(mark.media, 'gap');
  assert.equal(mark.gapType, JOSH_GAP_TYPE.label);
  assert.equal(mark.gapMm, 3.5);

  const label = resolveJoshJobParams({ paperType: 'Label', gapMm: 3 });
  assert.equal(label.media, 'gap');
  assert.equal(label.gapType, JOSH_GAP_TYPE.label);
  assert.equal(label.gapMm, 3);
});

test('explicit media wins over paper type', () => {
  const job = resolveJoshJobParams({
    paperType: 'Label',
    media: 'bline',
    gapMm: 2.5,
    density: 8,
    speed: 1,
  });
  assert.equal(job.media, 'bline');
  assert.equal(job.gapType, JOSH_GAP_TYPE.blackMark);
  assert.equal(job.gapMm, 2.5);
  assert.equal(job.density, 8);
  assert.equal(job.speed, 1);
});

test('Josh GAP_TYPE: Receipt 0, Transparent 1, Label 2, Cardstock 3; old Black mark is 2', () => {
  const receipt = resolveJoshJobParams({ paperType: 'Receipt', gapMm: 3 });
  assert.equal(receipt.gapType, JOSH_GAP_TYPE.receipt);
  assert.equal(receipt.gapMm, 0);
  assert.equal(joshGapLength01mm(receipt.gapMm), 0);

  for (const [paperType, media, gapType] of [
    ['Label', 'gap', 2],
    ['Black mark', 'gap', 2],
    ['Transparent', 'hole', 1],
    ['Cardstock', 'bline', 3],
  ] as const) {
    const job = resolveJoshJobParams({ paperType, gapMm: 3 });
    assert.equal(job.media, media, paperType);
    assert.equal(job.gapType, gapType, paperType);
    assert.equal(job.gapMm, 3, paperType);
    assert.equal(joshGapLength01mm(job.gapMm), 300, paperType);
  }
  assert.equal(JOSH_GAP_TYPE.hole, 1);
  assert.equal(JOSH_GAP_TYPE.blackMark, 3);
});
