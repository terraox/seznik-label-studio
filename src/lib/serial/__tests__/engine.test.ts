import assert from 'node:assert/strict';
import test from 'node:test';

import { applySerialOffset } from '@/lib/serial-content';
import { resolveAlphabet } from '@/lib/serial/alphabet';
import { gs1CheckDigit, luhnCheckDigit } from '@/lib/serial/check-digit';
import { firstAndLast, longestValue, resolveField, validateConfig, valueAt } from '@/lib/serial/engine';
import { legacyToSerial } from '@/lib/serial/legacy';
import type { SerialConfig } from '@/lib/serial/types';

function cfg(over: Partial<SerialConfig> = {}): SerialConfig {
  return { v: 1, id: 'a', kind: 'number', start: '1', step: '1', ...over };
}
function val(c: SerialConfig, i: number, ctx?: { encodeMode?: string }): string {
  const r = valueAt(c, i, ctx);
  assert.ok(r.ok, r.ok ? '' : r.message);
  return r.value;
}
function fails(c: SerialConfig, i: number) {
  const r = valueAt(c, i);
  assert.equal(r.ok, false);
  return r.ok ? null : r;
}

// Seeded PRNG so failures reproduce.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('numbers: start, step, padding, prefix and suffix', () => {
  assert.equal(val(cfg(), 0), '1');
  assert.equal(val(cfg(), 9), '10');
  assert.equal(val(cfg({ start: '0042' }), 1), '0043');
  assert.equal(val(cfg({ start: '7', minWidth: 3 }), 2), '009');
  assert.equal(val(cfg({ start: '1', minWidth: 4, padChar: '*' }), 0), '***1');
  assert.equal(val(cfg({ prefix: 'SN-', suffix: '/A', minWidth: 3 }), 4), 'SN-005/A');
  assert.equal(val(cfg({ start: '10', step: '5' }), 3), '25');
});

test('numbers: step down and negatives only if the start is negative', () => {
  assert.equal(val(cfg({ start: '10', step: '-3' }), 3), '1');
  const r = fails(cfg({ start: '10', step: '-3' }), 4);
  assert.equal(r?.reason, 'underflow');
  assert.equal(val(cfg({ start: '-2', step: '1' }), 5), '3');
  assert.equal(val(cfg({ start: '-2', step: '-1', minWidth: 3 }), 2), '-004');
});

test('numbers: 30 digit values are exact', () => {
  const start = '123456789012345678901234567890';
  assert.equal(val(cfg({ start }), 0), start);
  assert.equal(val(cfg({ start }), 10), '123456789012345678901234567900');
  assert.equal(val(cfg({ start: '999999999999999999999999999999' }), 1), '1000000000000000000000000000000');
  assert.equal(val(cfg({ start: '9007199254740991' }), 2), '9007199254740993');
  assert.equal(val(cfg({ start: '1', step: '9007199254740993' }), 3), '27021597764222980');
});

test('numbers: overflow modes', () => {
  assert.equal(val(cfg({ start: '998', overflow: 'extend', minWidth: 3 }), 3), '1001');
  assert.equal(val(cfg({ start: '998', overflow: 'wrap', minWidth: 3 }), 3), '001');
  assert.equal(val(cfg({ start: '998', overflow: 'wrap', minWidth: 3 }), 2), '000');
  const stop = fails(cfg({ start: '998', overflow: 'stop', minWidth: 3 }), 2);
  assert.equal(stop?.reason, 'overflow');
  assert.equal(val(cfg({ start: '998', overflow: 'stop', minWidth: 3 }), 1), '999');
  assert.equal(val(cfg({ start: '2', step: '-1', overflow: 'wrap', minWidth: 3 }), 3), '999');
});

test('decimals are exact and never drift', () => {
  const c = cfg({ kind: 'decimal', start: '0', step: '0.1', decimals: 1 });
  assert.equal(val(c, 3), '0.3');
  assert.equal(val(c, 1000), '100.0');
  assert.equal(val(cfg({ kind: 'decimal', start: '0.00', step: '0.01', decimals: 2 }), 7), '0.07');
  assert.equal(val(cfg({ kind: 'decimal', start: '12.5', step: '0.25', decimals: 2 }), 5), '13.75');
  assert.equal(val(cfg({ kind: 'decimal', start: '10', step: '-0.5', decimals: 1 }), 3), '8.5');
  assert.equal(val(cfg({ kind: 'decimal', start: '1', step: '1', decimals: 0 }), 4), '5');
  assert.equal(val(cfg({ kind: 'decimal', start: '0', step: '0.00000001', decimals: 8 }), 3), '0.00000003');
});

test('decimals: rounding is applied once when parsing', () => {
  const up = cfg({ kind: 'decimal', start: '1.005', step: '1', decimals: 2, rounding: 'half-up' });
  assert.equal(val(up, 0), '1.01');
  const down = cfg({ kind: 'decimal', start: '1.005', step: '1', decimals: 2, rounding: 'down' });
  assert.equal(val(down, 0), '1.00');
  assert.equal(val(down, 2), '3.00');
  assert.equal(val(cfg({ kind: 'decimal', start: '5', step: '1', decimals: 2, minWidth: 3 }), 0), '005.00');
});

test('letters follow the spreadsheet rule', () => {
  const l = cfg({ kind: 'letters', start: 'A' });
  assert.equal(val(l, 0), 'A');
  assert.equal(val(l, 25), 'Z');
  assert.equal(val(l, 26), 'AA');
  assert.equal(val(l, 27), 'AB');
  assert.equal(val(l, 26 + 26 * 26 - 1), 'ZZ');
  assert.equal(val(l, 26 + 26 * 26), 'AAA');
  assert.equal(val(cfg({ kind: 'letters', start: 'AA' }), 0), 'AA');
  assert.equal(val(cfg({ kind: 'letters', start: 'Y', step: '2' }), 1), 'AA');
  assert.equal(val(cfg({ kind: 'letters', start: 'C', letterCase: 'lower' }), 1), 'd');
  assert.equal(val(cfg({ kind: 'letters', start: 'a' }), 1), 'B');
});

test('letters: overflow modes', () => {
  assert.equal(val(cfg({ kind: 'letters', start: 'Y', overflow: 'wrap' }), 2), 'A');
  assert.equal(val(cfg({ kind: 'letters', start: 'ZY', overflow: 'wrap' }), 2), 'AA');
  assert.equal(fails(cfg({ kind: 'letters', start: 'Y', overflow: 'stop' }), 2)?.reason, 'overflow');
  assert.equal(val(cfg({ kind: 'letters', start: 'C', step: '-1', overflow: 'wrap' }), 3), 'Z');
  assert.equal(fails(cfg({ kind: 'letters', start: 'B', step: '-1' }), 2)?.reason, 'underflow');
});

test('excluded characters change the base (skip I and O = base 24)', () => {
  const a = resolveAlphabet({ kind: 'letters', excluded: 'IO' });
  assert.ok(a.ok);
  assert.equal(a.ok && a.chars.length, 24);
  const l = cfg({ kind: 'letters', start: 'A', excluded: 'IO' });
  const seq = Array.from({ length: 24 }, (_, i) => val(l, i));
  assert.ok(!seq.some((s) => s.includes('I') || s.includes('O')));
  assert.equal(val(l, 7), 'H');
  assert.equal(val(l, 8), 'J');
  assert.equal(val(l, 23), 'Z');
  assert.equal(val(l, 24), 'AA');
  assert.equal(val(l, 24 + 24 * 24 - 1), 'ZZ');
  assert.equal(val(l, 24 + 24 * 24), 'AAA');
  assert.equal(fails(cfg({ kind: 'letters', start: 'I', excluded: 'I' }), 0)?.reason, 'invalid-config');
});

test('alphanumeric, hex and custom are positional with fixed width', () => {
  assert.equal(val(cfg({ kind: 'alnum', start: '00A' }), 1), '00B');
  assert.equal(val(cfg({ kind: 'alnum', start: '00Z' }), 1), '010');
  assert.equal(val(cfg({ kind: 'alnum', start: 'ZZZ', overflow: 'extend' }), 1), '1000');
  assert.equal(val(cfg({ kind: 'alnum', start: 'ZZZ', overflow: 'wrap' }), 1), '000');
  assert.equal(fails(cfg({ kind: 'alnum', start: 'ZZZ', overflow: 'stop' }), 1)?.reason, 'overflow');
  assert.equal(val(cfg({ kind: 'hex', start: '0FE' }), 3), '101');
  assert.equal(val(cfg({ kind: 'hex', start: 'a9', letterCase: 'lower' }), 1), 'aa');
  assert.equal(val(cfg({ kind: 'hex', start: '7', minWidth: 4 }), 0), '0007');
  assert.equal(val(cfg({ kind: 'hex', start: 'FF', overflow: 'extend' }), 1), '100');
  assert.equal(val(cfg({ kind: 'custom', alphabet: 'XYZ', start: 'X' }), 3), 'YX');
  assert.equal(val(cfg({ kind: 'custom', alphabet: 'XYZ', start: 'ZZ', overflow: 'wrap' }), 1), 'XX');
  assert.equal(val(cfg({ kind: 'custom', alphabet: '01', start: '111', step: '1' }), 1), '1000');
  assert.equal(val(cfg({ kind: 'custom', alphabet: 'abc', start: 'a', excluded: 'b' }), 1), 'c');
});

test('repeatEach shows the same value on N consecutive labels', () => {
  const c = cfg({ start: '1', repeatEach: 3 });
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => val(c, i)),
    ['1', '1', '1', '2', '2', '2', '3', '3'],
  );
});

test('check digits', () => {
  assert.equal(luhnCheckDigit('7992739871'), 3);
  assert.equal(val(cfg({ start: '1234', checkDigit: 'mod10' }), 0), `1234${luhnCheckDigit('1234')}`);
  assert.equal(fails(cfg({ start: '1', prefix: 'A', checkDigit: 'mod10' }), 0)?.reason, 'invalid-config');
  // EAN-13: 4006381333931
  assert.equal(gs1CheckDigit('400638133393'), 1);
  const ean = cfg({ start: '400638133393', checkDigit: 'symbology' });
  assert.equal(val(ean, 0, { encodeMode: 'EAN-13' }), '4006381333931');
  assert.equal(val(ean, 0, { encodeMode: 'CODE-128' }), '400638133393');
  // UPC-A 036000291452
  assert.equal(val(cfg({ start: '03600029145', checkDigit: 'symbology' }), 0, { encodeMode: 'UPC-A' }), '036000291452');
  // EAN-8 96385074
  assert.equal(val(cfg({ start: '9638507', checkDigit: 'symbology' }), 0, { encodeMode: 'EAN-8' }), '96385074');
});

test('linked fields return exactly what the root produces, including the check digit', () => {
  const barcode = cfg({ id: 'bc', start: '400638133393', checkDigit: 'symbology' });
  const text = cfg({ id: 'tx', linkTo: 'bc' });
  const configs = { bc: barcode, tx: text };
  const ctx = { bc: { encodeMode: 'EAN-13' } };
  const r = resolveField(configs, 'tx', 0, ctx);
  assert.ok(r.ok && r.value === '4006381333931');
  const loop = resolveField({ a: cfg({ id: 'a', linkTo: 'b' }), b: cfg({ id: 'b', linkTo: 'a' }) }, 'a', 0);
  assert.equal(loop.ok, false);
  const missing = resolveField({ a: cfg({ id: 'a', linkTo: 'zz' }) }, 'a', 0);
  assert.equal(missing.ok, false);
});

test('random access equals sequential generation (property)', () => {
  const rand = rng(12345);
  const kinds = ['number', 'decimal', 'letters', 'alnum', 'hex', 'custom'] as const;
  for (let n = 0; n < 400; n += 1) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const overflow = (['extend', 'wrap', 'stop'] as const)[Math.floor(rand() * 3)];
    const step = String(Math.floor(rand() * 7) + 1) + (kind === 'decimal' && rand() < 0.5 ? '.5' : '');
    let start = '1';
    if (kind === 'letters') start = 'ABCXYZ'[Math.floor(rand() * 6)] + (rand() < 0.3 ? 'A' : '');
    else if (kind === 'alnum' || kind === 'hex') start = ['0', '09', 'A', 'F0', 'Z'][Math.floor(rand() * 5)];
    else if (kind === 'custom') start = 'ab'[Math.floor(rand() * 2)];
    else start = String(Math.floor(rand() * 200));
    const c = cfg({
      kind,
      start,
      step: kind === 'decimal' ? step : String(Math.floor(rand() * 5) + 1),
      overflow,
      decimals: 2,
      alphabet: 'abc',
      minWidth: Math.floor(rand() * 4),
      repeatEach: 1 + Math.floor(rand() * 3),
      excluded: kind === 'letters' && rand() < 0.5 ? 'IO' : undefined,
    });
    const sequential: (string | null)[] = [];
    for (let i = 0; i < 80; i += 1) {
      const r = valueAt(c, i);
      sequential.push(r.ok ? r.value : null);
    }
    // Direct jumps in random order give the same answers.
    for (let k = 0; k < 40; k += 1) {
      const i = Math.floor(rand() * 80);
      const r = valueAt(c, i);
      assert.equal(r.ok ? r.value : null, sequential[i], `${JSON.stringify(c)} @${i}`);
    }
    // Stepping is consistent: a +step ahead index maps to the same value as sequential accumulation.
    if (kind === 'number' && overflow === 'extend' && sequential.every((v) => v !== null)) {
      const base = BigInt(c.start);
      const st = BigInt(c.step);
      const rep = c.repeatEach ?? 1;
      for (let i = 0; i < 80; i += 1) {
        const expected = (base + st * BigInt(Math.floor(i / rep))).toString();
        assert.equal(sequential[i]!.replace(/^0+(?=\d)/, ''), expected);
      }
    }
  }
});

test('random access works at very large indexes without looping', () => {
  assert.equal(val(cfg({ start: '1' }), 4_999_999), '5000000');
  assert.equal(val(cfg({ kind: 'letters', start: 'A' }), 1_000_000).length > 3, true);
});

test('longestValue equals the brute force maximum (property)', () => {
  const rand = rng(777);
  for (let n = 0; n < 150; n += 1) {
    const c = cfg({
      kind: rand() < 0.5 ? 'number' : 'letters',
      start: rand() < 0.5 ? String(Math.floor(rand() * 300)) : 'B',
      step: String(1 + Math.floor(rand() * 20)),
      overflow: (['extend', 'wrap'] as const)[Math.floor(rand() * 2)],
      prefix: rand() < 0.3 ? 'X' : undefined,
    });
    if (c.kind === 'letters') c.start = 'Q';
    const count = 1 + Math.floor(rand() * 60);
    const offset = Math.floor(rand() * 30);
    let brute = '';
    let broke = false;
    for (let i = 0; i < count; i += 1) {
      const r = valueAt(c, offset + i);
      if (!r.ok) {
        broke = true;
        break;
      }
      if (r.value.length > brute.length) brute = r.value;
    }
    if (broke) continue;
    assert.equal(longestValue(c, count, offset)?.length, brute.length, JSON.stringify(c));
  }
  const fl = firstAndLast(cfg({ start: '8' }), 5);
  assert.deepEqual(fl, { first: '8', last: '12' });
});

test('legacy adapter matches the old applySerialOffset for ordinary counters', () => {
  const samples: [string, number][] = [['015', 1], ['001', 5], ['A-007', 2], ['X9', 1], ['100', 10], ['5', 3], ['SN0099-Z', 1]];
  for (const [content, step] of samples) {
    const c = legacyToSerial(content, step, 'l');
    assert.ok(c, content);
    for (let page = 0; page < 12; page += 1) {
      assert.equal(val(c!, page), applySerialOffset(content, step, page), `${content} step ${step} page ${page}`);
    }
  }
  assert.equal(legacyToSerial('no digits', 1, 'x'), null);
});

test('validateConfig: plain messages', () => {
  const msgs = (c: SerialConfig, count = 10) => validateConfig(c, count).map((i) => i.message);
  assert.deepEqual(msgs(cfg()), []);
  assert.ok(msgs(cfg({ step: '0' })).some((m) => /Step cannot be 0/.test(m)));
  assert.ok(msgs(cfg(), 0).some((m) => /Count/.test(m)));
  assert.ok(msgs(cfg(), 5001).some((m) => /5000/.test(m)));
  assert.ok(msgs(cfg({ start: 'abc' })).some((m) => /whole number/.test(m)));
  assert.ok(msgs(cfg({ kind: 'letters', start: '1' })).some((m) => /letters/.test(m)));
  assert.ok(msgs(cfg({ kind: 'hex', start: 'G' })).some((m) => /alphabet/.test(m)));
  assert.ok(msgs(cfg({ start: '98', overflow: 'stop', minWidth: 2 }), 5).some((m) => /Label 3/.test(m)));
  assert.ok(msgs(cfg({ start: '3', step: '-1' }), 10).some((m) => /below 0/.test(m)));
  assert.ok(msgs(cfg({ kind: 'decimal', start: '1', decimals: 9 })).some((m) => /0 to 8/.test(m)));
  assert.ok(msgs(cfg({ repeatEach: 0 })).some((m) => /Repeat/.test(m)));
  assert.ok(msgs(cfg({ padChar: 'ab' })).some((m) => /single character/.test(m)));
});

test('validateConfig rejects bad custom alphabets', () => {
  const custom = (over: Partial<SerialConfig>) => validateConfig(cfg({ kind: 'custom', start: 'a', ...over }), 5);
  assert.ok(custom({ alphabet: 'aab' }).some((i) => /repeats/.test(i.message)));
  assert.ok(custom({ alphabet: 'a' }).some((i) => /at least 2/.test(i.message)));
  assert.ok(custom({ alphabet: '' }).some((i) => /at least 2/.test(i.message)));
  assert.ok(custom({ alphabet: 'abc', excluded: 'bc' }).some((i) => /excluded/.test(i.message)));
  assert.ok(custom({ alphabet: 'ab', excluded: 'ab' }).some((i) => /excluded/.test(i.message)));
  assert.deepEqual(custom({ alphabet: 'abc', excluded: 'c' }), []);
  // Built-in kinds are protected too.
  const letters = validateConfig(cfg({ kind: 'letters', start: 'A', excluded: 'ABCDEFGHIJKLMNOPQRSTUVWXY' }), 5);
  assert.ok(letters.some((i) => /excluded/.test(i.message)));
});
