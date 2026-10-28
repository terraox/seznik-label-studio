import assert from 'node:assert';
import { test } from 'node:test';

import { detectSections, prepareAnalysis, detectPrepared } from '../detector';
import { growRegionAt } from '../grow';
import { areaOf, containsPoint, hitChain } from '../hit-test';
import { normRectToScreen, normToScreen, screenToNorm, type Rotation, type ViewTransform } from '../map';
import { resolveTapChain } from '../resolve';
import { applyTap, emptySelection, REPEAT_MS, selectionRect, selectOnly } from '../selection';
import { leaves, type NormRect, type Section } from '../types';
import {
  PAGE_H,
  PAGE_W,
  blank,
  fxBarcodeField,
  fxBlankMargin,
  fxGrid2x2,
  fxGutterOnly,
  fxNoiseSpecks,
  boxBorder,
  fxTableGrid,
  hDashed,
  hRule,
  textBlock,
  textLine,
  vRule,
} from './fixtures';

const TOL = 0.02;
const nx = (px: number) => px / PAGE_W;
const ny = (px: number) => px / PAGE_H;
const fmt = (r: NormRect) => `x=${r.x.toFixed(3)} y=${r.y.toFixed(3)} w=${r.w.toFixed(3)} h=${r.h.toFixed(3)}`;

function near(label: string, got: NormRect, want: NormRect, tol = TOL) {
  const ok =
    Math.abs(got.x - want.x) <= tol &&
    Math.abs(got.y - want.y) <= tol &&
    Math.abs(got.x + got.w - (want.x + want.w)) <= tol &&
    Math.abs(got.y + got.h - (want.y + want.h)) <= tol;
  assert.ok(ok, `${label}: got ${fmt(got)}, want ${fmt(want)} ±${tol}`);
}

/** Table on the top half, a text block below. */
function fxHalfTable() {
  const p = blank();
  for (let i = 0; i <= 20; i++) hRule(p, 40, 40 + i * 24, 680, 2);
  for (let i = 0; i < 20; i++) textLine(p, 44, 40 + i * 24 + 5, 672, 14, 700 + i);
  vRule(p, 40, 40, 480, 2);
  vRule(p, 718, 40, 480, 2);
  textBlock(p, 40, 600, 680, 340, 14, 6, 777);
  return p;
}

console.log('--- smart-crop tap-to-select tests ---');

// ── Coordinate mapping ──────────────────────────────────────────────────────

test('map: crop view (no rotation, zoom 1) is a plain scale', () => {
  const t: ViewTransform = { stageW: 380, stageH: 500 };
  assert.deepStrictEqual(screenToNorm({ x: 190, y: 125 }, t), { x: 0.5, y: 0.25 });
  assert.strictEqual(screenToNorm({ x: 400, y: 10 }, t), null, 'off the page');
});

test('map: page corners land where a clockwise turn puts them', () => {
  const t: ViewTransform = { stageW: 500, stageH: 380, rotation: 90 };
  const tl = normToScreen({ x: 0, y: 0 }, t);
  assert.deepStrictEqual(tl, { x: 500, y: 0 }, '90°: page top-left is shown top-right');
  const t180: ViewTransform = { stageW: 380, stageH: 500, rotation: 180 };
  assert.deepStrictEqual(normToScreen({ x: 0, y: 0 }, t180), { x: 380, y: 500 });
  const t270: ViewTransform = { stageW: 500, stageH: 380, rotation: 270 };
  assert.deepStrictEqual(normToScreen({ x: 0, y: 0 }, t270), { x: 0, y: 380 });
});

test('map: screen → page → screen round-trips at 0/90/180/270 and zoom 1/2/4', () => {
  let checked = 0;
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const turned = rotation === 90 || rotation === 270;
    for (const zoom of [1, 2, 4]) {
      const t: ViewTransform = {
        stageW: turned ? 500 : 380,
        stageH: turned ? 380 : 500,
        rotation,
        zoom,
        panX: zoom === 1 ? 0 : -37,
        panY: zoom === 1 ? 0 : 21,
      };
      for (const p of [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.83, y: 0.07 },
      ]) {
        const s = normToScreen(p, t);
        const back = screenToNorm(s, t);
        if (!back) continue; // zoomed out of view: off-page is the right answer
        assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9, `rot ${rotation} zoom ${zoom}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 30, `checked ${checked} points`);
  console.log(`  map: ${checked} round trips across 4 rotations × 3 zooms`);
});

test('map: a section rect drawn on a rotated, zoomed page stays axis-aligned and the right size', () => {
  const r = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  const s = normRectToScreen(r, { stageW: 500, stageH: 380, rotation: 90, zoom: 2 });
  assert.ok(Math.abs(s.w - 0.4 * 500 * 2) < 1e-9 && Math.abs(s.h - 0.3 * 380 * 2) < 1e-9);
});

// ── Hit-test ────────────────────────────────────────────────────────────────

const grid = detectSections(fxGrid2x2());
const [tl] = leaves(grid);

test('hit-test: inside a section returns it first, then its parents outward', () => {
  const chain = hitChain(grid, { x: tl.rect.x + tl.rect.w / 2, y: tl.rect.y + tl.rect.h / 2 });
  assert.strictEqual(chain[0].id, tl.id);
  assert.ok(chain.length >= 2, 'nested: leaf then group(s)');
  for (let i = 1; i < chain.length; i++) {
    assert.ok(areaOf(chain[i].rect) > areaOf(chain[i - 1].rect), 'strictly growing outward');
    assert.strictEqual(chain[i].kind, 'group');
  }
});

test('hit-test: exactly on the edge counts as inside', () => {
  const chain = hitChain(grid, { x: tl.rect.x, y: tl.rect.y + tl.rect.h / 2 });
  assert.strictEqual(chain[0]?.id, tl.id);
  const justOut = hitChain(grid, { x: tl.rect.x - 0.002, y: tl.rect.y + tl.rect.h / 2 });
  assert.strictEqual(justOut[0]?.id, tl.id, 'within EDGE_SLOP');
});

test('hit-test: outside every section returns no leaf', () => {
  const chain = hitChain(grid, { x: 0.5, y: 0.5 });
  assert.ok(chain.every((s) => s.kind === 'group'), 'only groups at the gutter crossing');
  assert.deepStrictEqual(hitChain(grid, { x: 0.01, y: 0.99 }), []);
});

// ── Region-grow ─────────────────────────────────────────────────────────────

test('grow: tap on a text block selects that block, not the page', () => {
  const ctx = prepareAnalysis(fxGutterOnly());
  const g = growRegionAt(ctx, { x: 0.5, y: 0.2 });
  assert.ok(g);
  console.log(`  grow text-block: ${fmt(g.rect)} source=${g.source}`);
  assert.strictEqual(g.source, 'grown');
  near('text block', g.rect, { x: nx(40), y: ny(40), w: nx(680), h: ny(376) });
});

test('grow: tap on a barcode selects the code block and knows it is a code', () => {
  const ctx = prepareAnalysis(fxBarcodeField());
  const g = growRegionAt(ctx, { x: 0.5, y: ny(440) });
  assert.ok(g);
  console.log(`  grow barcode: ${fmt(g.rect)} code=${g.hasCodeLike}`);
  near('barcode', g.rect, { x: nx(50), y: ny(420), w: nx(660), h: ny(40) });
  assert.strictEqual(g.hasCodeLike, true);
});

test('grow: tap inside a table that fills half the page selects the table, not the page', () => {
  const ctx = prepareAnalysis(fxHalfTable());
  const g = growRegionAt(ctx, { x: 0.5, y: ny(200) });
  assert.ok(g);
  console.log(`  grow half-table: ${fmt(g.rect)} note=${g.note ?? '-'}`);
  assert.ok(g.rect.h < 0.6, 'not the whole page');
  near('table', g.rect, { x: nx(40), y: ny(40), w: nx(680), h: ny(482) });
});

test('grow: tap inside a table that fills the page is capped, never silent', () => {
  const page = fxTableGrid();
  const ctx = prepareAnalysis(page);
  const bare = growRegionAt(ctx, { x: 0.5, y: 0.5 });
  assert.ok(bare);
  assert.strictEqual(bare.note, 'capped');
  assert.ok(bare.confidence <= 0.2, 'low confidence when nothing better exists');
  const withDetection = growRegionAt(ctx, { x: 0.5, y: 0.5 }, detectPrepared(ctx));
  assert.ok(withDetection);
  assert.strictEqual(withDetection.note, 'capped');
  assert.strictEqual(withDetection.source, 'detected', 'falls back to the enclosing detected section');
  console.log(`  grow full-table: capped → ${withDetection.source} ${fmt(withDetection.rect)}`);
});

test('grow: tap on empty background returns nothing', () => {
  const ctx = prepareAnalysis(fxGutterOnly());
  assert.strictEqual(growRegionAt(ctx, { x: 0.5, y: ny(470) }), null);
  assert.strictEqual(growRegionAt(ctx, { x: 0.02, y: 0.98 }), null);
});

test('grow: an isolated block with no separators around it', () => {
  const ctx = prepareAnalysis(fxBlankMargin());
  const g = growRegionAt(ctx, { x: 0.5, y: 0.5 });
  assert.ok(g);
  near('block', g.rect, { x: nx(230), y: ny(400), w: nx(300), h: ny(194) });
});

test('grow: a speck is flagged too-small, not dropped silently', () => {
  const ctx = prepareAnalysis(fxNoiseSpecks());
  const g = growRegionAt(ctx, { x: nx(9), y: ny(9) });
  assert.ok(g, 'something is returned');
  assert.strictEqual(g.note, 'too-small');
});

test('grow: a block that is really a detected section comes back as that section', () => {
  const ctx = prepareAnalysis(fxGutterOnly());
  const result = detectPrepared(ctx);
  const g = growRegionAt(ctx, { x: 0.5, y: 0.2 }, result);
  assert.ok(g);
  assert.strictEqual(g.source, 'detected');
  assert.strictEqual(g.id, leaves(result)[0].id);
});

test('resolve: detected leaf wins; gutter tap grows nothing; no detection yet still grows', () => {
  const ctx = prepareAnalysis(fxGrid2x2());
  const result = detectPrepared(ctx);
  const onLeaf = resolveTapChain(ctx, result, { x: tl.rect.x + 0.05, y: tl.rect.y + 0.05 });
  assert.strictEqual(onLeaf.via, 'detected');
  assert.strictEqual(resolveTapChain(ctx, result, { x: 0.5, y: 0.5 }).via, 'none');
  const early = resolveTapChain(ctx, null, { x: tl.rect.x + 0.05, y: tl.rect.y + 0.05 });
  assert.strictEqual(early.via, 'grown', 'works before detection exists');
  assert.ok(containsPoint(early.chain[0].rect, { x: tl.rect.x + 0.05, y: tl.rect.y + 0.05 }));
});

// ── Selection ───────────────────────────────────────────────────────────────

const [a, b, c, d] = leaves(grid);
const chainAt = (s: Section) => hitChain(grid, { x: s.rect.x + s.rect.w / 2, y: s.rect.y + s.rect.h / 2 });
const at = (s: Section, t: number) => ({ x: s.rect.x + s.rect.w / 2, y: s.rect.y + s.rect.h / 2, at: t });
const SLOP = 0.012;

test('select: add, add, union box, remove, select none', () => {
  let sel = emptySelection();
  ({ sel } = applyTap(sel, chainAt(a), at(a, 0), SLOP));
  ({ sel } = applyTap(sel, chainAt(d), at(d, 5000), SLOP));
  assert.strictEqual(sel.items.length, 2);
  const u = selectionRect(sel)!;
  near('union of TL and BR', u, {
    x: a.rect.x,
    y: a.rect.y,
    w: d.rect.x + d.rect.w - a.rect.x,
    h: d.rect.y + d.rect.h - a.rect.y,
  }, 1e-9);
  const r = applyTap(sel, chainAt(a), at(a, 10000), SLOP);
  assert.strictEqual(r.outcome.kind, 'removed');
  assert.strictEqual(r.sel.items.length, 1);
  near('window shrinks back', selectionRect(r.sel)!, d.rect, 1e-9);
  assert.strictEqual(selectionRect(emptySelection()), null, 'select none');
  void b;
  void c;
});

test('select: repeat tap on the same spot steps outward, then wraps back to the smallest', () => {
  let sel = emptySelection();
  const chain = chainAt(a);
  const seen: string[] = [];
  let t = 0;
  ({ sel } = applyTap(sel, chain, at(a, t), SLOP));
  seen.push(sel.items[0].id);
  for (let i = 0; i < chain.length; i++) {
    t += 400;
    const r = applyTap(sel, chain, at(a, t), SLOP);
    assert.strictEqual(r.outcome.kind, 'stepped');
    sel = r.sel;
    seen.push(sel.items[0].id);
  }
  assert.deepStrictEqual(seen.slice(0, chain.length), chain.map((s) => s.id), 'leaf → parent → … → root');
  assert.strictEqual(seen[chain.length], chain[0].id, 'wraps back to the smallest');
  assert.strictEqual(sel.items.length, 1, 'stepping replaces, never piles up');
});

test('select: a slow second tap on the same spot removes instead of stepping', () => {
  let sel = emptySelection();
  ({ sel } = applyTap(sel, chainAt(a), at(a, 0), SLOP));
  const r = applyTap(sel, chainAt(a), at(a, REPEAT_MS + 1), SLOP);
  assert.strictEqual(r.outcome.kind, 'removed');
});

test('select: Prev / Next replaces the selection with one section', () => {
  const sel = selectOnly(c);
  assert.deepStrictEqual(sel.items.map((s) => s.id), [c.id]);
});

test('select: tapping nothing changes nothing', () => {
  const sel = selectOnly(a);
  const r = applyTap(sel, [], { x: 0.5, y: 0.5, at: 0 }, SLOP);
  assert.strictEqual(r.outcome.kind, 'nothing');
  assert.strictEqual(r.sel.items.length, 1);
});

test('grow: never crosses a dashed cut line sitting a few px from the content', () => {
  const p = blank();
  boxBorder(p, 60, 60, 640, 380);
  textBlock(p, 80, 80, 600, 340, 7);
  hDashed(p, 40, 448, 680);
  boxBorder(p, 60, 456, 640, 380);
  textBlock(p, 80, 476, 600, 340, 9);
  const ctx = prepareAnalysis(p);
  const upper = growRegionAt(ctx, { x: 0.5, y: ny(439) });
  assert.ok(upper);
  assert.ok(upper.rect.y + upper.rect.h <= ny(448) + 0.002, `upper block stops at the line: ${fmt(upper.rect)}`);
  const lower = growRegionAt(ctx, { x: 0.5, y: ny(458) });
  assert.ok(lower);
  assert.ok(lower.rect.y >= ny(450) - 0.002, `lower block starts below the line: ${fmt(lower.rect)}`);
});
