import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLIPART_CATALOG,
  CLIPART_CATEGORIES,
  CLIPART_ID_ALIASES,
} from '@/constants/clipart-catalog';
import { buildClipartSvg } from '@/lib/clipart/build-svg';
import { parseSvgDrawOps, parseSvgViewBox, sanitizeUserSvg } from '@/lib/clipart/parse-svg';

test('each Indian clipart category has at least 80 symbols', () => {
  for (const category of CLIPART_CATEGORIES) {
    const count = CLIPART_CATALOG.filter((item) => item.category === category.id).length;
    assert.ok(count >= 80, `${category.label} has ${count} icons, need 80+`);
  }
  const ids = new Set(CLIPART_CATALOG.map((item) => item.id));
  assert.equal(ids.size, CLIPART_CATALOG.length);
  assert.ok(CLIPART_CATALOG.length >= 640);
});

test('every catalog entry builds an SVG with draw ops', () => {
  for (const entry of CLIPART_CATALOG) {
    const svg = buildClipartSvg(entry);
    assert.ok(svg.includes('<svg'), `${entry.id} missing svg`);
    const ops = parseSvgDrawOps(svg);
    assert.ok(ops.length > 0, `${entry.id} produced no draw ops`);
  }
});

test('legacy an-rabbit alias points at the rabbit sticker', () => {
  const aliased = CLIPART_ID_ALIASES['an-rabbit'];
  const item = CLIPART_CATALOG.find((entry) => entry.id === aliased);
  assert.ok(item);
  assert.match(item!.label.toLowerCase(), /rabbit/);
});

test('sanitizeUserSvg rejects scripts and accepts simple svg', () => {
  assert.equal(sanitizeUserSvg('<svg><script>x</script></svg>'), null);
  const ok = sanitizeUserSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
  );
  assert.ok(ok);
});

test('user SVGs keep their own viewBox, default fill and polylines for printing', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 256"><path d="M0 0h512v256H0z"/><polyline stroke="#000" fill="none" points="10,10 20,30 40,10"/></svg>';
  assert.deepEqual(parseSvgViewBox(svg), { x: 0, y: 0, w: 512, h: 256 });
  const ops = parseSvgDrawOps(svg);
  assert.equal(ops.length, 2);
  assert.equal(ops[0]!.t === 'path' && ops[0]!.fill, true, 'no fill attribute paints black');
  assert.equal(ops[1]!.t === 'path' && ops[1]!.fill, false);
  assert.deepEqual(parseSvgViewBox(buildClipartSvg(CLIPART_CATALOG[0]!)), { x: 0, y: 0, w: 24, h: 24 });
});

test('rect geometry is not read from stroke-width, rx or cx look-alikes', () => {
  const [op] = parseSvgDrawOps(
    '<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="1.6" x="4" y="3" width="16" height="18" rx="2.5"/></svg>',
  );
  assert.deepEqual(op, { t: 'rect', x: 4, y: 3, w: 16, h: 18, rx: 2.5, fill: false, sw: 1.6 });
});

test('India sticker set: unique ids and names, every one draws, rupee signs included', async () => {
  const { INDIA_CLIPART } = await import('@/constants/clipart-india');
  assert.equal(new Set(INDIA_CLIPART.map((x) => x.id)).size, INDIA_CLIPART.length);
  assert.equal(new Set(INDIA_CLIPART.map((x) => x.label.toLowerCase())).size, INDIA_CLIPART.length);
  for (const item of INDIA_CLIPART) {
    assert.ok(parseSvgDrawOps(item.svg).length > 0, `${item.id} has no draw ops`);
    assert.ok(!/NaN|undefined/.test(item.svg), `${item.id} has a bad number`);
  }
  for (const category of CLIPART_CATEGORIES) {
    assert.ok(INDIA_CLIPART.filter((x) => x.category === category.id).length >= 15, `${category.label} is thin`);
  }
  for (const id of ['in-rupee', 'in-rupee-coin', 'in-rupee-note', 'in-upi-phone', 'in-gold-coin']) {
    assert.ok(INDIA_CLIPART.some((x) => x.id === id), `${id} missing`);
  }
});
