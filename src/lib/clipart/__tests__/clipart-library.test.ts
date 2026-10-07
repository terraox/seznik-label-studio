import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLIPART_CATALOG,
  CLIPART_CATEGORIES,
  CLIPART_ID_ALIASES,
} from '@/constants/clipart-catalog';
import { buildClipartSvg } from '@/lib/clipart/build-svg';
import { parseSvgDrawOps, sanitizeUserSvg } from '@/lib/clipart/parse-svg';

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
