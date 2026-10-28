import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTemplate, locateFromProfile, ruleGroups, type RowProfile } from '../profile';

const H = 842;
/** A column profile: 2-row solid rules at the given page fractions, 20% ink elsewhere. */
function profile(rules: number[], lastInk = 0.84): RowProfile {
  const p = new Uint8Array(H);
  for (let y = 0; y < Math.round(lastInk * H); y++) p[y] = 20;
  for (const r of rules) for (let i = 0; i < 2; i++) p[Math.round(r * H) + i] = 100;
  return p;
}

const meeshoTemplate = buildTemplate(
  'meesho',
  {
    label: { x: 0.01, y: 0.005, w: 0.98, h: 0.457 },
    invoice: { x: 0.018, y: 0.476, w: 0.965, h: 0.368 },
  },
  profile([0.014, 0.056, 0.386, 0.451, 0.476, 0.58, 0.803, 0.838]),
);

test('ruleGroups reads solid rows as fractions of the page', () => {
  const g = ruleGroups(profile([0.1, 0.5]));
  assert.equal(g.length, 2);
  assert.ok(Math.abs(g[0].y - 0.1) < 0.002 && Math.abs(g[1].y - 0.5) < 0.002);
});

test('meesho: a shorter label moves the bottom edge and the invoice', () => {
  const r = locateFromProfile(meeshoTemplate, profile([0.014, 0.344, 0.411, 0.436, 0.538, 0.762, 0.798], 0.8))!;
  assert.ok(r);
  assert.ok(Math.abs(r.label.y + r.label.h - (0.411 + 0.0024 + 0.002)) < 0.003);
  assert.ok(r.invoice && Math.abs(r.invoice.y - 0.436) < 0.002);
  assert.ok(r.invoice.y + r.invoice.h <= 0.81);
});

test('meesho: an exchange label has no invoice', () => {
  const r = locateFromProfile(meeshoTemplate, profile([0.014, 0.33, 0.397], 0.4))!;
  assert.ok(r);
  assert.equal(r.invoice, null);
  assert.ok(r.label.y + r.label.h < 0.42);
});

test('meesho: a page without a top border is handed to the full detector', () => {
  assert.equal(locateFromProfile(meeshoTemplate, profile([0.33, 0.397])), null);
});

test('fixed layouts reuse the template only while the rules line up', () => {
  const template = buildTemplate(
    'flipkart',
    { label: { x: 0.3, y: 0.03, w: 0.4, h: 0.42 }, invoice: { x: 0.08, y: 0.46, w: 0.84, h: 0.4 } },
    profile([0.034, 0.062, 0.292, 0.33, 0.398, 0.451]),
  );
  const same = locateFromProfile(template, profile([0.034, 0.062, 0.292, 0.33, 0.398, 0.451]))!;
  assert.deepEqual(same.label, template.label);
  assert.equal(locateFromProfile(template, profile([0.1, 0.2, 0.3])), null);
});
