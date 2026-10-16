import assert from 'node:assert';
import { test } from 'node:test';

import { buildCodeMap } from '../codes';
import { binarize, Integral, inkBounds, measureTone, padRect } from '../gray';
import { axisScale, DEFAULT_DETECT_OPTIONS as opts, type Scale } from '../params';
import { lineProfile } from '../profile';
import { findSeparators, type SeparatorScan } from '../rules';
import type { GrayPage, PxRect } from '../types';
import {
  fxBarcodeField,
  fxDashedH,
  fxFooterLine,
  fxPaleBandH,
  fxTableGrid,
  fxTextLineIsolated,
} from './fixtures';

/** Run the horizontal separator scan over the whole content rect of a page. */
function scanH(page: GrayPage): { scan: SeparatorScan; content: PxRect } {
  const tone = measureTone(page, opts);
  const mask = binarize(page, tone.inkMax);
  const it = new Integral(mask);
  const full = { x: 0, y: 0, w: page.width, h: page.height };
  const content = padRect(inkBounds(it, full, 4, 4)!, 2, full);
  const unit = Math.max(page.width, page.height);
  const scale: Scale = {
    unit,
    contentW: content.w,
    contentH: content.h,
    contentArea: content.w * content.h,
    pageW: page.width,
    pageH: page.height,
    paperLevel: tone.paperLevel,
    inkMax: tone.inkMax,
    minAreaPx: opts.minArea * content.w * content.h,
    padPx: Math.round(opts.pad * unit),
  };
  const as = axisScale(scale, 'h', opts);
  const p = lineProfile(page, mask, content, 'h', as.dashGapPx, opts.toneTol);
  const codes = buildCodeMap(mask, unit, opts);
  return { scan: findSeparators(page, mask, it, codes, content, p, as, scale, opts), content };
}

/** Rejections and acceptances overlapping rows [y0, y1). */
const at = (scan: SeparatorScan, y0: number, y1: number) => ({
  accepted: scan.accepted.filter((s) => s.start < y1 && s.end > y0),
  rejected: scan.rejected.filter((s) => s.start < y1 && s.end > y0),
});

console.log('--- smart-crop separator classification tests ---');

test('dashed rule is classified dashed (regular dash and gap)', () => {
  const hit = at(scanH(fxDashedH()).scan, 456, 458);
  assert.strictEqual(hit.accepted.length, 1, JSON.stringify(hit));
  assert.strictEqual(hit.accepted[0].kind, 'dashed');
  assert.strictEqual(hit.accepted[0].distinct, true);
});

test('a lone full-width text line is a candidate, and is rejected as text', () => {
  const hit = at(scanH(fxTextLineIsolated()).scan, 354, 368);
  console.log(`  text-line: rejected ${JSON.stringify(hit.rejected.map((r) => r.reason))}`);
  assert.strictEqual(hit.accepted.length, 0, 'never accepted as a separator');
  assert.ok(hit.rejected.some((r) => r.reason === 'text'), 'rejected for being text');
});

test('a footer line is rejected as text', () => {
  const hit = at(scanH(fxFooterLine()).scan, 346, 358);
  assert.strictEqual(hit.accepted.length, 0);
  assert.ok(hit.rejected.some((r) => r.reason === 'text'));
});

test('pale band is found by tone, not ink, and is a distinct band', () => {
  const { scan } = scanH(fxPaleBandH(241));
  const hit = at(scan, 442, 476);
  console.log(`  pale-band: accepted ${JSON.stringify(hit.accepted.map((a) => [a.kind, a.start, a.end]))}`);
  const band = hit.accepted.find((a) => a.kind === 'band');
  assert.ok(band, 'tone band accepted');
  assert.strictEqual(band.solidity < opts.bandSolidity, true, 'not solid ink — only the tone test can find it');
  assert.strictEqual(band.clearSides, 0, 'ink on both sides, accepted anyway because a band is distinct (R2.4)');
});

test('a barcode wide enough to be a candidate is rejected as a code', () => {
  const hit = at(scanH(fxBarcodeField()).scan, 420, 460);
  console.log(`  barcode: rejected ${JSON.stringify(hit.rejected.map((r) => r.reason))}`);
  assert.strictEqual(hit.accepted.filter((a) => a.kind !== 'gutter').length, 0);
  assert.ok(hit.rejected.some((r) => r.reason === 'code'), 'rejected as a code');
});

test('tight table rules are rejected for lack of clearance', () => {
  const { scan } = scanH(fxTableGrid());
  const inner = scan.rejected.filter((r) => r.start > 60 && r.end < 900 && r.thickness <= 3);
  assert.ok(inner.length >= 30, `most inner rules rejected (${inner.length})`);
  assert.ok(inner.every((r) => r.reason === 'no-clearance'), 'every inner rule: no clearance');
  assert.strictEqual(
    scan.accepted.filter((a) => a.start > 60 && a.end < 900 && a.kind !== 'gutter').length,
    0,
    'no inner rule accepted',
  );
});
