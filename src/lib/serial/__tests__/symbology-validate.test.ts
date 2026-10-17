import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '@/components/editor/types';
import { createLabelDocument, type LabelElement } from '@/lib/label-document';
import { defaultSerialConfig } from '@/lib/serial/legacy';
import {
  barcodeCharsetIssues,
  barcodeSerialIssues,
  barcodeValueProblem,
  barcodeWidthFit,
  qrSerialIssues,
  qrValueProblem,
  serialPrintGate,
  validateAllValues,
} from '@/lib/serial/symbology-validate';
import type { SerialConfig } from '@/lib/serial/types';

const cfg = (over: Partial<SerialConfig> = {}): SerialConfig => ({ ...defaultSerialConfig(), id: 'f', ...over });
const one = (c: SerialConfig) => ({ configs: { [c.id]: c }, contexts: { [c.id]: {} as { encodeMode?: string } } });

test('Code 39 and Code 128 character sets are exact', () => {
  assert.equal(barcodeValueProblem('CODE-39', 'AB-12.$/+% '), null);
  assert.match(barcodeValueProblem('CODE-39', 'ab1')!, /lowercase 'a'/);
  assert.match(barcodeValueProblem('CODE-39', 'A*B')!, /start\/stop/);
  assert.match(barcodeValueProblem('CODE-39', 'A_B')!, /'_'/);
  assert.equal(barcodeValueProblem('CODE-128', 'Hello ~ 123'), null);
  assert.match(barcodeValueProblem('CODE-128', 'café')!, /cannot print/);
  assert.match(barcodeValueProblem('CODE-128', '')!, /empty/);
});

test('ITF, EAN-13, UPC-A and EAN-8 digit counts and check digits', () => {
  assert.equal(barcodeValueProblem('ITF', '1234'), null);
  assert.match(barcodeValueProblem('ITF', '123')!, /even number/);
  assert.match(barcodeValueProblem('ITF', '12a4')!, /digits/);
  assert.equal(barcodeValueProblem('EAN-13', '400638133393'), null);
  assert.equal(barcodeValueProblem('EAN-13', '4006381333931'), null);
  assert.match(barcodeValueProblem('EAN-13', '4006381333930')!, /check digit/);
  assert.match(barcodeValueProblem('EAN-13', '12345')!, /needs 12 digits/);
  assert.equal(barcodeValueProblem('UPC-A', '03600029145'), null);
  assert.equal(barcodeValueProblem('UPC-A', '036000291452'), null);
  assert.match(barcodeValueProblem('UPC-A', '036000291453')!, /check digit/);
  assert.equal(barcodeValueProblem('EAN-8', '9638507'), null);
  assert.equal(barcodeValueProblem('EAN-8', '96385074'), null);
  assert.match(barcodeValueProblem('EAN-8', '96385075')!, /check digit/);
});

test('prefix, suffix and alphabet are checked character by character', () => {
  const a = barcodeCharsetIssues('CODE-39', cfg({ prefix: 'ab' }));
  assert.ok(a.some((i) => /prefix/i.test(i.message)));
  const b = barcodeCharsetIssues('CODE-39', cfg({ kind: 'letters', start: 'a', letterCase: 'lower' }));
  assert.ok(b.some((i) => i.fix?.serial.letterCase === 'upper'));
  const c = barcodeCharsetIssues('CODE-39', cfg({ kind: 'custom', alphabet: 'ab_', start: 'a' }));
  assert.ok(c.length > 0);
  assert.deepEqual(barcodeCharsetIssues('CODE-128', cfg({ prefix: 'SN-' })), []);
  assert.ok(barcodeCharsetIssues('ITF', cfg({ prefix: 'A' })).length > 0);
  assert.ok(barcodeCharsetIssues('EAN-13', cfg({ kind: 'decimal' })).length > 0); // '.' is not a digit
});

test('a bad value fails before label 1: the gate checks every value', () => {
  // Code 39 with numbers is fine for 40 labels; a Wrap config can never produce lowercase, so craft a late failure:
  // ITF where the 10th label first has an odd digit count (9 -> 10 is fine, 99 -> 100 is odd).
  const c = cfg({ start: '98', minWidth: 2 }); // 98, 99, 100 ...
  const { configs, contexts } = one(c);
  const bad = validateAllValues(configs, 'f', 5, 0, contexts, (v) => barcodeValueProblem('ITF', v));
  assert.equal(bad?.label, 3);
  assert.equal(bad?.value, '100');
  const issues = barcodeSerialIssues({ mode: 'ITF', config: c, configs, contexts, count: 5, offset: 0, widthMm: 40 });
  assert.equal(issues[0].severity, 'error');
  assert.equal(issues[0].label, 3);
  // one-tap fix pads every value to an even length
  const fix = issues[0].fix!;
  assert.ok(fix);
  const fixed = fix.serial;
  const again = barcodeSerialIssues({ mode: 'ITF', config: fixed, configs: { f: fixed }, contexts: { f: {} }, count: 5, offset: 0, widthMm: 40 });
  assert.deepEqual(again.filter((i) => i.severity === 'error'), []);
});

test('EAN-13 with too few digits offers a padding fix', () => {
  const c = cfg({ start: '1', checkDigit: 'symbology' });
  const { configs } = one(c);
  const contexts = { f: { encodeMode: 'EAN-13' } };
  const issues = barcodeSerialIssues({ mode: 'EAN-13', config: c, configs, contexts, count: 10, offset: 0, widthMm: 40 });
  assert.equal(issues[0].severity, 'error');
  assert.equal(issues[0].fix?.serial.minWidth, 12);
  const fixed = issues[0].fix!.serial;
  const ok = barcodeSerialIssues({ mode: 'EAN-13', config: fixed, configs: { f: fixed }, contexts, count: 10, offset: 0, widthMm: 40 });
  assert.deepEqual(ok.filter((i) => i.severity === 'error'), []);
});

test('barcode width fit uses the longest value, and a narrower printer DPI changes the result', () => {
  const short = barcodeWidthFit('CODE-128', '12', 30, 203)!;
  const long = barcodeWidthFit('CODE-128', '123456789012345678', 30, 203)!;
  assert.ok(long.requiredMm > short.requiredMm);
  const tiny = barcodeWidthFit('CODE-128', '123456789012345678', 12, 203)!;
  assert.equal(tiny.fits, false);
  // same width fits at a higher DPI only if the dot count allows; required dots are DPI independent
  const hi = barcodeWidthFit('CODE-128', '123456789012345678', 30, 300)!;
  assert.ok(hi.requiredMm < long.requiredMm);
  const c = cfg({ start: '1', prefix: 'LONGPREFIX-LONG-', minWidth: 6 });
  const { configs, contexts } = one(c);
  const issues = barcodeSerialIssues({ mode: 'CODE-128', config: c, configs, contexts, count: 5, offset: 0, widthMm: 18, dpi: 203 });
  assert.ok(issues.some((i) => i.severity === 'error' && /longest value/.test(i.message)));
});

test('QR payload limits and density', () => {
  assert.equal(qrValueProblem('QRCode', 'M', 'https://seznik.in/1'), null);
  assert.match(qrValueProblem('QRCode', 'H', 'x'.repeat(3000))!, /too long/);
  assert.match(qrValueProblem('PDF417', 'M', 'x'.repeat(2000))!, /bytes/);
  const c = cfg({ prefix: 'https://seznik.in/very/long/path/that/keeps/going/', start: '1' });
  const { configs, contexts } = one(c);
  const dense = qrSerialIssues({ mode: 'QRCode', level: 'M', zoneSize: '0', config: c, configs, contexts, count: 10, offset: 0, widthMm: 6, dpi: 203 });
  assert.ok(dense.length > 0);
  const roomy = qrSerialIssues({ mode: 'QRCode', level: 'M', zoneSize: '0', config: c, configs, contexts, count: 10, offset: 0, widthMm: 30, dpi: 203 });
  assert.deepEqual(roomy, []);
});

test('print gate: checks every field, every label, and points at the element', () => {
  const text = { ...DEFAULT_ELEMENT_STATE, id: 't', type: 'text', contentType: 'Degrees', serial: cfg({ id: 'ft', start: '98', minWidth: 2, overflow: 'stop' }) };
  const barcode = { ...DEFAULT_BARCODE_STATE, id: 'b', type: 'barcode', encodeMode: 'CODE-39', width: 40, contentType: 'Degrees', serial: cfg({ id: 'fb', kind: 'letters', start: 'a', letterCase: 'lower' }) };
  const qr = { ...DEFAULT_QRCODE_STATE, id: 'q', type: 'qrcode', width: 20, contentType: 'Degrees', serial: cfg({ id: 'fq', start: '1' }) };
  const doc = createLabelDocument({ name: 'g', widthMm: 60, heightMm: 40, elements: [text, barcode, qr] as unknown as LabelElement[] });
  const fine = serialPrintGate(doc, 2, 0, null);
  assert.deepEqual(Object.keys(fine.byElement), ['b']);
  const wide = serialPrintGate(doc, 5, 0, 203);
  assert.deepEqual(Object.keys(wide.byElement).sort(), ['b', 't']);
  assert.ok(wide.byElement.t[0].label === 3);
});
