import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampTd404Density,
  clampTd404GapMm,
  clampTd404Speed,
  resolveTd404JobParams,
  td404MediaForPaperType,
} from '@/lib/printer/td404-job-params';

test('Auto density and speed use the TD-404 defaults', () => {
  assert.equal(clampTd404Density(null), 10);
  assert.equal(clampTd404Speed(undefined), 3);
  const job = resolveTd404JobParams({ paperType: 'Label', gapMm: 2 });
  assert.equal(job.density, 10);
  assert.equal(job.speed, 3);
  assert.equal(job.media, 'gap');
  assert.equal(job.gapMm, 2);
});

test('density, speed, and gap clamp to the SDK range', () => {
  assert.equal(clampTd404Density(-4), 0);
  assert.equal(clampTd404Density(15.4), 15);
  assert.equal(clampTd404Density(99), 15);
  assert.equal(clampTd404Speed(0), 1);
  assert.equal(clampTd404Speed(1.5), 2);
  assert.equal(clampTd404Speed(12), 7);
  assert.equal(clampTd404GapMm(-1), 0);
  assert.equal(clampTd404GapMm(20.004), 20);
  assert.equal(clampTd404GapMm(2.256), 2.26);
});

test('paper type maps to the two TSPL media lines', () => {
  assert.equal(td404MediaForPaperType('Receipt'), 'continuous');
  assert.equal(td404MediaForPaperType('Black mark'), 'gap');
  assert.equal(td404MediaForPaperType('Label'), 'gap');
  assert.equal(td404MediaForPaperType('Cardstock'), 'gap');
  assert.equal(td404MediaForPaperType('Transparent'), 'gap');
  assert.equal(td404MediaForPaperType('unknown'), 'gap');

  const receipt = resolveTd404JobParams({ paperType: 'Receipt', gapMm: 3, density: 12, speed: 4 });
  assert.equal(receipt.media, 'continuous');
  assert.equal(receipt.gapMm, 0);
  assert.equal(receipt.density, 12);
  assert.equal(receipt.speed, 4);

  const mark = resolveTd404JobParams({ paperType: 'Black mark', gapMm: 3.5 });
  assert.equal(mark.media, 'gap');
  assert.equal(mark.gapMm, 3.5);

  const card = resolveTd404JobParams({ paperType: 'Cardstock', gapMm: 25, density: 40, speed: 0 });
  assert.equal(card.media, 'gap');
  assert.equal(card.gapMm, 20);
  assert.equal(card.density, 15);
  assert.equal(card.speed, 1);
});
