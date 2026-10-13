import assert from 'node:assert/strict';
import test from 'node:test';

import { LINE_EMOJI } from '@/constants/line-emoji-catalog';
import { parseSvgDrawOps, separateSvgArcFlags } from '@/lib/clipart/parse-svg';

test('glued arc flags match the canvas SVG reading', () => {
  const heart = 'M12 21s-8-5.4-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.6-8 11-8 11z';
  const out = separateSvgArcFlags(heart);
  assert.match(out, /a 4\.5 4\.5 0 0 1 8 -2\.8/);
  assert.match(out, /A 4\.5 4\.5 0 0 1 20 10/);
  assert.equal(separateSvgArcFlags(out), out);
});

test('already separated arcs stay on the same endpoints', () => {
  const out = separateSvgArcFlags('M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0Z');
  assert.match(out, /a 9\.5 9\.5 0 1 0 19 0/);
  assert.match(out, /a 9\.5 9\.5 0 1 0 -19 0/);
});

test('every line-art emoji path keeps its commands after arc normalization', () => {
  for (const entry of LINE_EMOJI) {
    for (const op of parseSvgDrawOps(entry.svg)) {
      if (op.t !== 'path') continue;
      const out = separateSvgArcFlags(op.d);
      const commands = op.d.match(/[a-zA-Z]/g) ?? [];
      const normalized = out.match(/[a-zA-Z]/g) ?? [];
      assert.deepEqual(normalized, commands, entry.id);
      assert.equal(separateSvgArcFlags(out), out, entry.id);
    }
  }
});
