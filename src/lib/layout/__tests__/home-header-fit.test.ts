import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BRAND_REFERENCE_WIDTH,
  brandScale,
  pillNaturalWidth,
  pillRoom,
  pillVariant,
  pillWidth,
  type PillVariant,
} from '../home-header-fit';

const WIDTHS = [320, 360, 375, 393, 412, 430] as const;
const FONT_SCALES = [0.85, 1, 1.15, 1.3] as const;
/** Badge 48 + gap 11 + the SEZNIK lockup at its fixed size (measured ≈ 106 dp). */
const BRAND = 48 + 11 + 106;
const PAD = 16;
const GAP = 16;
const ORDER: PillVariant[] = ['minimal', 'compact', 'full'];

test('room left for the pill never grows as the phone narrows', () => {
  let last = Infinity;
  for (const w of [...WIDTHS].reverse()) {
    const room = pillRoom(w, PAD, BRAND, GAP);
    assert.ok(room <= last, `room at ${w}`);
    last = room;
  }
});

test('a bigger font or a narrower phone never gives a fuller pill', () => {
  for (const fs of FONT_SCALES) {
    let last = 2;
    for (const w of [...WIDTHS].reverse()) {
      const v = ORDER.indexOf(pillVariant(pillRoom(w, PAD, BRAND, GAP), fs));
      assert.ok(v <= last, `${w}dp @${fs}`);
      last = v;
    }
  }
  for (const w of WIDTHS) {
    let last = -1;
    for (const fs of [...FONT_SCALES].reverse()) {
      const v = ORDER.indexOf(pillVariant(pillRoom(w, PAD, BRAND, GAP), fs));
      assert.ok(v >= last, `${w}dp @${fs}`);
      last = v;
    }
  }
});

test('room that fits the whole pill always gets the whole pill', () => {
  for (const fs of FONT_SCALES) {
    assert.equal(pillVariant(pillNaturalWidth(fs), fs), 'full');
    assert.equal(pillVariant(pillNaturalWidth(fs) + 50, fs), 'full');
  }
});

test('wide phones at default font keep the full pill', () => {
  for (const w of [412, 430]) {
    assert.equal(pillVariant(pillRoom(w, PAD, BRAND, GAP), 1), 'full', `${w}dp`);
  }
});

test('narrow phones drop parts instead of crushing the brand name', () => {
  assert.notEqual(pillVariant(pillRoom(320, PAD, BRAND, GAP), 1), 'full');
  assert.notEqual(pillVariant(pillRoom(360, PAD, BRAND, GAP), 1.3), 'full');
});

test('each variant is narrower than the one before', () => {
  for (const fs of FONT_SCALES) {
    assert.ok(pillWidth('full', fs) > pillWidth('compact', fs));
    assert.ok(pillWidth('compact', fs) > pillWidth('minimal', fs));
  }
});

test('the brand lockup is full size from the reference width up and proportional below it', () => {
  for (const w of [BRAND_REFERENCE_WIDTH, 412, 430, 600]) assert.equal(brandScale(w), 1, `${w}dp`);
  let last = 1;
  for (const w of [380, 360, 340, 320, 280]) {
    const k = brandScale(w);
    assert.ok(k <= last && k >= 0.82 && k < 1, `${w}dp → ${k}`);
    last = k;
  }
  assert.ok(Math.abs(brandScale(360) - 360 / BRAND_REFERENCE_WIDTH) < 1e-9);
  assert.equal(brandScale(0), 1);
});
