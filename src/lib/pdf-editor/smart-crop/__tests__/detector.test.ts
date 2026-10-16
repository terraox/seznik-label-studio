import assert from 'node:assert';
import { test } from 'node:test';

import { detectSections } from '../detector';
import { leaves, unionRects, type DetectResult, type NormRect } from '../types';
import {
  PAGE_H,
  PAGE_W,
  fxBarcodeField,
  fxBlackBanner,
  fxBlankMargin,
  fxBorderedBoxTb,
  fxDashedH,
  fxDashedV,
  fxFilledBandH,
  fxFooterLine,
  fxGrid2x2,
  fxGutterOnly,
  fxHeadingCentred,
  fxNoSeparator,
  fxNoiseSpecks,
  fxPaleBandH,
  fxQrField,
  fxSolidH,
  fxTableGrid,
  fxTextLineIsolated,
  fxAmazonLike,
  fxValmoLike,
  rotate,
  shear,
} from './fixtures';

/** Edge tolerance for synthetic fixtures, as a fraction of the page. */
const TOL = 0.02;

const nx = (px: number) => px / PAGE_W;
const ny = (px: number) => px / PAGE_H;

function describeResult(r: DetectResult): string {
  return leaves(r)
    .map(
      (s) =>
        `#${s.order} x=${s.rect.x.toFixed(3)} y=${s.rect.y.toFixed(3)} w=${s.rect.w.toFixed(3)} h=${s.rect.h.toFixed(3)} ` +
        `conf=${s.confidence} code=${s.hasCodeLike} [${s.boundedBy.top}|${s.boundedBy.right}|${s.boundedBy.bottom}|${s.boundedBy.left}]`,
    )
    .join('\n    ');
}

function log(name: string, r: DetectResult) {
  console.log(`  ${name}: ${leaves(r).length} section(s), ${r.timing.totalMs}ms\n    ${describeResult(r)}`);
}

function assertCount(name: string, r: DetectResult, n: number) {
  log(name, r);
  assert.strictEqual(leaves(r).length, n, `${name}: expected ${n} section(s)\n    ${describeResult(r)}`);
}

/** Leaf whose rect contains `inner`, within TOL. */
function containing(r: DetectResult, inner: NormRect) {
  return leaves(r).find(
    (s) =>
      s.rect.x <= inner.x + TOL &&
      s.rect.y <= inner.y + TOL &&
      s.rect.x + s.rect.w >= inner.x + inner.w - TOL &&
      s.rect.y + s.rect.h >= inner.y + inner.h - TOL,
  );
}

function assertNear(label: string, got: number, want: number, tol = TOL) {
  assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got.toFixed(4)}, want ${want.toFixed(4)} ±${tol}`);
}

console.log('--- smart-crop detector tests ---');

// ── Separators that must split ──────────────────────────────────────────────

test('dashed-h splits top / bottom at the dashed rule', () => {
  const r = detectSections(fxDashedH());
  assertCount('dashed-h', r, 2);
  const [a, b] = leaves(r);
  assert.ok(a.rect.y + a.rect.h <= ny(456) + TOL, 'top section ends at the rule');
  assert.ok(b.rect.y >= ny(458) - TOL, 'bottom section starts after the rule');
  assert.strictEqual(a.boundedBy.bottom, 'dashed');
});

test('dashed-v splits left / right at the dashed rule', () => {
  const r = detectSections(fxDashedV());
  assertCount('dashed-v', r, 2);
  const [a, b] = leaves(r);
  assert.ok(a.rect.x + a.rect.w <= nx(382) + TOL, 'left section ends at the rule');
  assert.ok(b.rect.x >= nx(384) - TOL, 'right section starts after the rule');
  assert.strictEqual(a.boundedBy.right, 'dashed');
});

test('solid-h thin rule with clearance splits', () => {
  const r = detectSections(fxSolidH());
  assertCount('solid-h', r, 2);
  assert.strictEqual(leaves(r)[0].boundedBy.bottom, 'solid', 'the rule splits, not whitespace');
});

test('filled-band-h splits at the band', () => {
  const r = detectSections(fxFilledBandH());
  assertCount('filled-band-h', r, 2);
  assert.strictEqual(leaves(r)[0].boundedBy.bottom, 'band');
});

test('pale-band-h (gray 241, text inside, lighter than ink) splits at the band', () => {
  const r = detectSections(fxPaleBandH());
  assertCount('pale-band-h', r, 2);
  const [a, b] = leaves(r);
  assert.strictEqual(a.boundedBy.bottom, 'band', 'boundary is the tone band');
  assert.ok(a.rect.y + a.rect.h <= ny(442) + TOL, 'top section ends at the band');
  assert.ok(b.rect.y >= ny(476) - TOL, 'bottom section starts after the band');
  assert.ok(r.tone.inkMax < 238, `band is lighter than the ink threshold (inkMax=${r.tone.inkMax})`);
});

test('pale-band at every tone 238-245 splits', () => {
  for (const level of [238, 239, 240, 241, 242, 243, 244, 245]) {
    const r = detectSections(fxPaleBandH(level));
    assert.strictEqual(leaves(r).length, 2, `pale band at gray ${level}\n    ${describeResult(r)}`);
    assert.strictEqual(leaves(r)[0].boundedBy.bottom, 'band', `gray ${level}: split by the band`);
  }
  console.log('  pale-band 238..245: 2 sections each, split by the band');
});

test('gutter-only splits on whitespace', () => {
  const r = detectSections(fxGutterOnly());
  assertCount('gutter-only', r, 2);
  assert.strictEqual(leaves(r)[0].boundedBy.bottom, 'gutter');
});

test('grid-2x2 gives four sections in reading order', () => {
  const r = detectSections(fxGrid2x2());
  assertCount('grid-2x2', r, 4);
  const [tl, tr, bl, br] = leaves(r);
  assert.ok(tl.rect.x < tr.rect.x && tl.rect.y < bl.rect.y && br.rect.x > bl.rect.x, 'reading order');
});

test('bordered label box narrower than the page is tightened to the box', () => {
  const r = detectSections(fxBorderedBoxTb());
  assertCount('bordered-box-tb', r, 2);
  const label = leaves(r)[0];
  assert.ok(label.rect.w <= 0.8, `label narrower than page: w=${label.rect.w.toFixed(3)}`);
  assertNear('label left', label.rect.x, nx(150));
  assertNear('label right', label.rect.x + label.rect.w, nx(610));
  assertNear('label centred', label.rect.x + label.rect.w / 2, 0.5, 0.03);
});

// ── Must NOT split ──────────────────────────────────────────────────────────

test('no-separator stays one section', () => {
  assertCount('no-separator', detectSections(fxNoSeparator()), 1);
});

test('MUST NOT SPLIT: a lone text line with blank space above and below', () => {
  const r = detectSections(fxTextLineIsolated());
  assertCount('text-line-isolated', r, 1);
  assert.ok(containing(r, { x: nx(40), y: ny(354), w: nx(680), h: ny(14) }), 'the line is kept, not eaten as a separator');
});

test('MUST NOT SPLIT: a centred heading', () => {
  const r = detectSections(fxHeadingCentred());
  assertCount('heading-centred', r, 1);
});

test('MUST NOT SPLIT: a footer line at the bottom of a block', () => {
  const r = detectSections(fxFooterLine());
  assertCount('footer-line', r, 1);
  assert.ok(containing(r, { x: nx(40), y: ny(346), w: nx(680), h: ny(12) }), 'footer line stays in the block');
});

test('MUST NOT SPLIT: barcode field (dense, solid enough to look like a band)', () => {
  const r = detectSections(fxBarcodeField());
  log('barcode-field', r);
  for (const s of leaves(r)) {
    const top = s.rect.y;
    const bottom = s.rect.y + s.rect.h;
    const cutsThrough = top > ny(420) + 0.005 && top < ny(460) - 0.005;
    const endsInside = bottom > ny(420) + 0.005 && bottom < ny(460) - 0.005;
    assert.ok(!cutsThrough && !endsInside, `no section edge inside the barcode\n    ${describeResult(r)}`);
  }
  const holder = containing(r, { x: nx(50), y: ny(420), w: nx(660), h: ny(40) });
  assert.ok(holder, 'one section holds the whole barcode');
  assert.strictEqual(holder.hasCodeLike, true, 'barcode is recognised as a code');
});

test('MUST NOT SPLIT: tight table grid (text immediately adjacent to every rule)', () => {
  assertCount('table-grid', detectSections(fxTableGrid()), 1);
});

test('MUST NOT SPLIT: black banner at the top of a label stays inside the label', () => {
  const r = detectSections(fxBlackBanner());
  assertCount('black-banner', r, 1);
  assert.ok(containing(r, { x: nx(40), y: ny(40), w: nx(680), h: ny(70) }), 'banner inside the section');
});

test('text blocks are not mistaken for codes', () => {
  for (const [name, fx] of [
    ['no-separator', fxNoSeparator],
    ['gutter-only', fxGutterOnly],
    ['table-grid', fxTableGrid],
  ] as const) {
    const r = detectSections(fx());
    for (const s of leaves(r)) assert.strictEqual(s.hasCodeLike, false, `${name}: text flagged as code`);
  }
});

// ── Margins, noise, transforms ──────────────────────────────────────────────

test('blank-margin: one section tightened to the block', () => {
  const r = detectSections(fxBlankMargin());
  assertCount('blank-margin', r, 1);
  const s = leaves(r)[0];
  assertNear('x', s.rect.x, nx(230));
  assertNear('y', s.rect.y, ny(400));
  assertNear('right', s.rect.x + s.rect.w, nx(530));
  assertNear('bottom', s.rect.y + s.rect.h, ny(600));
});

test('noise-specks do not stretch the content rect or add sections', () => {
  const r = detectSections(fxNoiseSpecks());
  assertCount('noise-specks', r, 1);
  assertNear('content x', r.contentRect.x, nx(230));
  assertNear('content y', r.contentRect.y, ny(400));
  assertNear('content right', r.contentRect.x + r.contentRect.w, nx(530));
  assertNear('content bottom', r.contentRect.y + r.contentRect.h, ny(600));
});

test('rotated 90/180/270: same split, boxes rotate with the page', () => {
  for (const deg of [90, 180, 270] as const) {
    const r = detectSections(rotate(fxDashedV(), deg));
    assert.strictEqual(leaves(r).length, 2, `rotated ${deg}\n    ${describeResult(r)}`);
    const axisEdge = deg === 180 ? 'right' : 'bottom';
    assert.strictEqual(leaves(r)[0].boundedBy[axisEdge], 'dashed', `rotated ${deg}: cut on the dashed rule`);
  }
  console.log('  rotated 90/180/270: 2 sections each, cut on the dashed rule');
});

test('skew 2°: a whitespace gutter still splits (horizontal and vertical tilt)', () => {
  assertCount('skew-gutter-h-2deg', detectSections(shear(fxGutterOnly(), 2, true)), 2);
  assertCount('skew-gutter-v-2deg', detectSections(shear(fxGrid2x2(), 2)), 4);
});

test('KNOWN GAP (Phase 4): a 2° tilt hides a thin rule from the row profile', () => {
  // A 3 px rule tilted 2° over 680 px spreads across ~24 rows, so no row
  // reaches ruleCover and the rule cannot split. Phase 4 adds coarse deskew;
  // this assertion is expected to flip to 2 then, deliberately.
  const r = detectSections(shear(fxSolidH(), 2, true));
  log('skew-rule-2deg (Phase 4 gap)', r);
  assert.strictEqual(leaves(r).length, 1, 'documented Phase 4 gap');
});

// ── Output contract ─────────────────────────────────────────────────────────

test('groups are kept so a tap can step outward', () => {
  const r = detectSections(fxGrid2x2());
  const groups = r.sections.filter((s) => s.kind === 'group');
  assert.ok(groups.length >= 1, 'at least the root group');
  for (const leaf of leaves(r)) assert.ok(leaf.parentId, 'every leaf has a parent');
});

test('suggested section prefers the one holding a barcode', () => {
  const r = detectSections(fxBarcodeField());
  const s = r.sections.find((x) => x.id === r.suggestedId);
  assert.ok(s, 'a suggestion exists');
  assert.strictEqual(s.hasCodeLike, true);
});

test('visible cap and over-cap logging', () => {
  const r = detectSections(fxGrid2x2(), { visibleCap: 2 });
  assert.strictEqual(r.visibleIds.length, 2);
  assert.strictEqual(r.dropped.filter((d) => d.reason === 'over-cap').length, 2);
  assert.strictEqual(leaves(r).length, 4, 'hidden sections stay in memory');
});

test('confidence is in range', () => {
  for (const fx of [fxDashedH, fxGrid2x2, fxNoSeparator, fxPaleBandH]) {
    for (const s of detectSections(fx()).sections) {
      assert.ok(s.confidence >= 0.1 && s.confidence <= 0.99, `confidence ${s.confidence}`);
    }
  }
});

test('blank page returns no sections', () => {
  const gray = new Uint8Array(PAGE_W * PAGE_H).fill(255);
  const r = detectSections({ width: PAGE_W, height: PAGE_H, gray });
  assert.strictEqual(r.sections.length, 0);
  assert.strictEqual(r.suggestedId, null);
});

test('large page is downscaled to analysisLongEdge', () => {
  const big = { width: 1654, height: 2339, gray: new Uint8Array(1654 * 2339).fill(255) };
  for (let y = 200; y < 600; y++) for (let x = 200; x < 1400; x++) if ((x + y) % 5 === 0) big.gray[y * 1654 + x] = 0;
  const r = detectSections(big);
  assert.strictEqual(Math.max(r.analysis.w, r.analysis.h), 1000);
});

test('unionRects merges selections', () => {
  const u = unionRects([
    { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { x: 0.5, y: 0.4, w: 0.1, h: 0.3 },
  ]);
  assert.deepStrictEqual(u, { x: 0.1, y: 0.1, w: 0.5, h: 0.6 });
  assert.strictEqual(unionRects([]), null);
});

test('QR field: not split (QR detection as a code is a stated Phase 1 gap)', () => {
  const r = detectSections(fxQrField());
  log('qr-field', r);
  const holder = containing(r, { x: nx(300), y: ny(400), w: nx(150), h: ny(150) });
  assert.ok(holder, 'one section holds the whole QR');
});

// ── Marketplace-shaped synthetics (stand-ins until the redacted PDFs exist) ─

test('amazon-like: label left, invoice right, bottom cut-line not inside either', () => {
  const r = detectSections(fxAmazonLike());
  log('amazon-like', r);
  const ls = leaves(r);
  assert.ok(ls.length >= 2, 'label + invoice (plus any sub-blocks)');
  const label = containing(r, { x: nx(20), y: ny(20), w: nx(350), h: ny(460) });
  assert.ok(label, 'one section holds the whole label box');
  assert.ok(label.rect.x + label.rect.w <= nx(381) + TOL, 'label stops at the dashed line');
  assert.strictEqual(label.hasCodeLike, true);
  assert.strictEqual(r.suggestedId, label.id, 'the label is the suggestion');
  const right = ls.filter((s) => s.id !== label.id);
  for (const s of right) assert.ok(s.rect.x >= nx(383) - TOL, 'invoice pieces are right of the dashed line');
  for (const s of ls) assert.ok(s.rect.y + s.rect.h <= ny(482) + 0.005, 'bottom dashed cut-line peeled off');
});

test('valmo-like: label, details row and invoice; cut at the pale band; label+details merge cleanly', () => {
  const r = detectSections(fxValmoLike());
  log('valmo-like', r);
  const ls = leaves(r);
  assert.ok(ls.length >= 2, 'at least label side + invoice');

  const invoice = ls.find((s) => s.boundedBy.top === 'band' && s.rect.y >= ny(506) - TOL);
  assert.ok(invoice, 'invoice starts right after the pale title band');

  const above = ls.filter((s) => s.rect.y + s.rect.h <= ny(474) + TOL).sort((a, b) => a.rect.y - b.rect.y);
  assert.ok(above.length >= 1, 'label side exists');
  const banner = containing(r, { x: nx(2), y: ny(2), w: nx(PAGE_W - 4), h: ny(70) });
  assert.ok(banner && banner.rect.h > ny(200), 'black banner is inside the label, not its own section');
  assert.ok(banner.hasCodeLike, 'label holds the barcode');
  assert.strictEqual(r.suggestedId, banner.id, 'the label is the suggestion');

  // "Merges cleanly" = nothing is lost between them: the only thing in the
  // strip between two label-side sections is the separator that was cut.
  for (let i = 1; i < above.length; i++) {
    const a = above[i - 1];
    const b = above[i];
    const gap = b.rect.y - (a.rect.y + a.rect.h);
    console.log(`  valmo-like: gap between label-side #${a.order} and #${b.order} = ${gap.toFixed(4)} (${a.boundedBy.bottom})`);
    assert.ok(['solid', 'band', 'dashed'].includes(a.boundedBy.bottom), 'split by a drawn separator');
    assert.strictEqual(a.boundedBy.bottom, b.boundedBy.top, 'the same separator bounds both');
    assert.ok(gap <= TOL, `strip between them is only the separator (gap ${gap.toFixed(4)})`);
  }
  const merged = unionRects(above.map((s) => s.rect))!;
  assert.ok(merged.y <= ny(2) + TOL && merged.y + merged.h >= ny(468) - TOL, 'merge covers banner..details');
  console.log(`  valmo-like: ${above.length} label-side section(s) above the band`);
});
