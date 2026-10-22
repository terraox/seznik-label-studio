import assert from 'node:assert/strict';
import test from 'node:test';

import { strToU8, zipSync, type Zippable } from 'fflate';

import { LIMITS, SEZLABEL_MIN_APP_VERSION } from '../limits';
import { buildSezlabel } from '../export';
import { finalizeDocument } from '../finalize';
import { parseSezlabel } from '../import';
import { sha256Hex } from '../sha256';
import { sanitizeSvgStrict } from '../svg-strict';
import { ShareFormatError, listZipEntries, readZip } from '../zip';
import { APP_VERSION, FakePhone, SAFE_SVG, fakePlacement, fullDocument, importEnv, makeFont, makeJpeg, makePng } from './fixtures';

type Rec = Record<string, any>;

const minimalDoc = (over: Rec = {}) => ({
  schemaVersion: 1, name: 'm', widthMm: 50, heightMm: 30, orientation: 0, paperType: 'Label', elements: [], ...over,
});

const text = (left = 1) => ({
  id: 't', type: 'text', text: 'hi', fontSize: 8, fontFamily: 'Default', left, top: 1, width: 10, rotation: 0,
});

/** Hand-build a package with a CORRECT manifest around arbitrary parts (names are not vetted here). */
function craft(parts: Record<string, Uint8Array | string>, manifestOver: Rec = {}, opts: { level?: 0 | 6 } = {}): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(parts)) data[k] = typeof v === 'string' ? strToU8(v) : v;
  const manifest = {
    format: 'sezlabel', schemaVersion: 1, minAppVersion: SEZLABEL_MIN_APP_VERSION, createdWithAppVersion: APP_VERSION,
    createdAt: 1, labelId: 'x', labelName: 'x', palette: [], includesData: false, userClipart: [], fonts: [],
    files: Object.entries(data).map(([path, d]) => ({ path, bytes: d.length, sha256: sha256Hex(d) })),
    ...manifestOver,
  };
  const z: Zippable = {};
  for (const [k, v] of Object.entries(data)) z[k] = [v, { level: opts.level ?? 6 }];
  z['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(z);
}

const parse = (bytes: Uint8Array, env = importEnv()) => parseSezlabel(bytes, env);
const rejects = (bytes: Uint8Array, code: string | RegExp, env = importEnv()) =>
  assert.throws(
    () => parse(bytes, env),
    (e: unknown) => e instanceof ShareFormatError && (typeof code === 'string' ? e.code === code : code.test(e.code)),
  );

const goodDoc = () => JSON.stringify(minimalDoc({ elements: [text()] }));

test('baseline: a hand-crafted valid package parses', () => {
  const r = parse(craft({ 'document.json': goodDoc() }));
  assert.equal(r.elementCount, 1);
});

// ───────────── path traversal and names ─────────────

test('path traversal, absolute, backslash, uppercase, nested and unknown names are rejected', () => {
  for (const name of ['../evil.txt', 'assets/../../evil.png', '/etc/passwd', 'assets\\images\\a.png', 'ASSETS/images/a.png', 'assets/images/sub/a.png', 'other/file.json', 'assets/images/.hidden/../a.png', 'assets/images/a b.png', 'C:evil.png', 'assets/images/a.png/']) {
    rejects(craft({ 'document.json': goodDoc(), [name]: makePng(4, 4) }), 'bad-name');
  }
});

test('duplicate entry names (case-insensitive after patching) are rejected', () => {
  const bytes = craft({ 'document.json': goodDoc(), 'assets/images/a1.png': makePng(4, 4, 1), 'assets/images/a2.png': makePng(4, 4, 2) });
  const patched = bytes.slice();
  const needle = strToU8('a2.png');
  for (let i = 0; i < patched.length - needle.length; i++) {
    if (needle.every((b, k) => patched[i + k] === b)) patched.set(strToU8('a1.png'), i);
  }
  rejects(patched, 'duplicate');
});

test('too many entries', () => {
  const parts: Record<string, string> = { 'document.json': goodDoc() };
  for (let i = 0; i < LIMITS.entries; i++) parts[`assets/images/p${i}.png`] = 'x';
  rejects(craft(parts), 'too-many-entries');
});

test('not a zip, empty, truncated', () => {
  rejects(strToU8('<html>hello</html>'.repeat(10)), 'not-zip');
  rejects(new Uint8Array(0), 'not-zip');
  const good = craft({ 'document.json': goodDoc() });
  rejects(good.slice(0, good.length - 30), /bad-zip|not-zip/);
  rejects(good.slice(0, 40), /bad-zip|not-zip/);
});

// ───────────── size lies and bombs ─────────────

function patchDeclaredSize(bytes: Uint8Array, entryName: string, newSize: number): Uint8Array {
  const out = bytes.slice();
  const dv = new DataView(out.buffer);
  const name = strToU8(entryName);
  const matches = (o: number) => name.every((b, k) => out[o + k] === b);
  for (let i = 0; i + 46 < out.length; i++) {
    if (dv.getUint32(i, true) === 0x04034b50 && matches(i + 30)) dv.setUint32(i + 22, newSize, true);
    if (dv.getUint32(i, true) === 0x02014b50 && matches(i + 46)) dv.setUint32(i + 24, newSize, true);
  }
  return out;
}

test('size lie: declared small, really big → stopped by the byte budget, never inflated whole', () => {
  const big = JSON.stringify(minimalDoc({ name: 'x'.repeat(3_000_000) }));
  const bytes = craft({ 'document.json': big }); // a 3 MB text deflates to a few KB
  assert.ok(bytes.length < 20_000);
  const lying = patchDeclaredSize(bytes, 'document.json', 2000);
  rejects(lying, /size-lie|inflate|bad-zip/);
});

test('size lie: declared bigger than real', () => {
  const bytes = craft({ 'document.json': goodDoc() });
  rejects(patchDeclaredSize(bytes, 'document.json', 4000), /size-lie|inflate|bad-zip/);
});

test('declared sizes over the limits are refused before anything is inflated', () => {
  rejects(patchDeclaredSize(craft({ 'document.json': goodDoc() }), 'document.json', LIMITS.documentJsonBytes + 1), 'entry-too-large');
  const huge = new Uint8Array(LIMITS.documentJsonBytes + 1000).fill(0x20);
  rejects(craft({ 'document.json': huge }), 'entry-too-large');
});

test('decompression bomb: tiny file, enormous ratio', () => {
  const zeros = new Uint8Array(LIMITS.imageBytes - 10);
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/z.png': zeros }), 'ratio');
});

test('total inflated size over the cap', () => {
  const parts: Record<string, Uint8Array | string> = { 'document.json': goodDoc() };
  // Eight noisy 11 MB parts: individually fine, together far over 80 MB.
  for (let i = 0; i < 8; i++) {
    const noisy = new Uint8Array(11 * 1024 * 1024);
    for (let k = 0; k < noisy.length; k += 7) noisy[k] = (k * 31 + i) & 255;
    parts[`assets/images/n${i}.png`] = noisy;
  }
  assert.throws(() => listZipEntries(craft(parts, {}, { level: 0 })), (e: unknown) => e instanceof ShareFormatError && /too-large|total-too-large|ratio/.test(e.code));
});

test('file larger than the cap', () => {
  rejects(new Uint8Array(LIMITS.fileBytes + 1), 'too-large');
});

// ───────────── pictures ─────────────

function withDims(png: Uint8Array, w: number, h: number): Uint8Array {
  const out = png.slice();
  const dv = new DataView(out.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return out;
}

test('huge picture dimensions are read from the header and refused', () => {
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': withDims(makePng(8, 8), 20000, 20000) }), 'image-too-large');
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': withDims(makePng(8, 8), 7000, 7000) }), 'image-too-large'); // 49 MP
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': withDims(makePng(8, 8), 0, 10) }), 'bad-image');
});

test('wrong types: HTML, executable, GIF or zip pretending to be a picture; extension mismatch', () => {
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': '<html><script>alert(1)</script></html>' }), 'bad-image');
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0x40]) }), 'bad-image');
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': strToU8('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00;') }), 'bad-image');
  const nested = craft({ 'document.json': goodDoc() });
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': nested }), 'bad-image');
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.jpg': makePng(4, 4) }), 'type-mismatch');
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': makeJpeg(4, 4) }), 'type-mismatch');
  // WebP is only for user clipart, never for a label picture.
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 3, 0, 0, 0, 0]);
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.webp': webp }), 'bad-image');
});

test('truncated or polyglot PNG headers are not accepted as pictures', () => {
  const png = makePng(8, 8);
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': png.slice(0, 20) }), 'bad-image');
  const polyglot = new Uint8Array([...strToU8('<html>'), ...png]);
  rejects(craft({ 'document.json': goodDoc(), 'assets/images/a.png': polyglot }), 'bad-image');
});

// ───────────── manifest integrity ─────────────

test('manifest checks: hash mismatch, unlisted part, listed-but-missing, bad format', () => {
  const doc = goodDoc();
  const png = makePng(4, 4);
  const good = { 'document.json': doc, 'assets/images/a.png': png };
  const tampered = craft(good, { files: [
    { path: 'document.json', bytes: strToU8(doc).length, sha256: sha256Hex(strToU8(doc)) },
    { path: 'assets/images/a.png', bytes: png.length, sha256: 'f'.repeat(64) },
  ] });
  rejects(tampered, 'hash-mismatch');
  rejects(craft(good, { files: [{ path: 'document.json', bytes: strToU8(doc).length, sha256: sha256Hex(strToU8(doc)) }] }), 'unlisted-entry');
  rejects(craft({ 'document.json': doc }, { files: [
    { path: 'document.json', bytes: strToU8(doc).length, sha256: sha256Hex(strToU8(doc)) },
    { path: 'assets/images/ghost.png', bytes: 1, sha256: 'a'.repeat(64) },
  ] }), 'missing-entry');
  rejects(craft({ 'document.json': doc }, { format: 'something-else' }), 'bad-format');
  rejects(zipSync({ 'document.json': strToU8(doc) }), 'no-manifest');
  rejects(craft({ 'document.json': 'not json {' }), 'bad-json');
});

// ───────────── versions ─────────────

test('version upgrade: a newer minAppVersion or schema is refused whole, with the update message', () => {
  const doc = goodDoc();
  for (const over of [{ minAppVersion: '9.0.0' }, { minAppVersion: '1.0.2' }, { schemaVersion: 2 }]) {
    assert.throws(
      () => parse(craft({ 'document.json': doc }, over)),
      (e: unknown) => e instanceof ShareFormatError && e.code === 'needs-newer-app' && e.message === 'Update Sez Print to open this label.',
    );
  }
  assert.doesNotThrow(() => parse(craft({ 'document.json': doc }, { minAppVersion: '1.0.1' })));
  assert.doesNotThrow(() => parse(craft({ 'document.json': doc }, { minAppVersion: '0.9' })));
  rejects(craft({ 'document.json': doc }, { minAppVersion: 'latest' }), 'bad-min-version');
  rejects(craft({ 'document.json': doc }, { schemaVersion: 0 }), 'bad-schema');
  // A phone on a newer app opens an older file.
  assert.doesNotThrow(() => parse(craft({ 'document.json': doc }), importEnv({ appVersion: '1.2.0' })));
});

test('same schema with extra unknown fields: imported, unknown fields preserved through a second export', async () => {
  const doc = JSON.stringify(minimalDoc({
    futureTop: { a: [1, 2, 3] },
    elements: [{ ...text(), futureEl: 'keep-me', serial: undefined }],
  }));
  const parsed = parse(craft({ 'document.json': doc }, { someNewManifestKey: 123 }));
  assert.deepEqual((parsed.document as Rec).futureTop, { a: [1, 2, 3] });
  assert.equal((parsed.document.elements[0] as Rec).futureEl, 'keep-me');
  const phone = new FakePhone();
  const imported = finalizeDocument(parsed, { ...fakePlacement(parsed as never, phone), name: 'x' });
  const out = await buildSezlabel(imported, phone.exportEnv());
  const again = parse(out.bytes);
  assert.equal((again.document.elements[0] as Rec).futureEl, 'keep-me');
  assert.deepEqual((again.document as Rec).futureTop, { a: [1, 2, 3] });
});

// ───────────── hostile document.json ─────────────

test('prototype pollution keys are refused at any depth', () => {
  for (const evil of [
    '{"__proto__":{"polluted":true},"name":"x","widthMm":50,"heightMm":30,"elements":[]}',
    '{"name":"x","widthMm":50,"heightMm":30,"elements":[{"type":"text","constructor":{"x":1}}]}',
    '{"name":"x","widthMm":50,"heightMm":30,"elements":[],"deep":{"a":{"prototype":{}}}}',
  ]) rejects(craft({ 'document.json': evil }), 'forbidden-key');
  assert.equal(({} as Rec).polluted, undefined);
});

test('depth, long strings, non-finite numbers, too many elements', () => {
  let deep: any = 1;
  for (let i = 0; i < 100; i++) deep = { a: deep };
  rejects(craft({ 'document.json': JSON.stringify(minimalDoc({ deep })) }), 'depth');
  rejects(craft({ 'document.json': JSON.stringify(minimalDoc({ name: 'x'.repeat(LIMITS.stringChars + 1) })) }), 'string-too-long');
  rejects(craft({ 'document.json': '{"name":"x","widthMm":1e999,"heightMm":30,"elements":[]}' }), /bad-number|bad-size/);
  rejects(craft({ 'document.json': JSON.stringify(minimalDoc({ widthMm: 5000 })) }), 'bad-size');
  rejects(craft({ 'document.json': JSON.stringify(minimalDoc({ widthMm: 'wide' })) }), 'bad-size');
  const many = Array.from({ length: LIMITS.elements + 1 }, (_, i) => ({ ...text(i % 40), id: `t${i}` }));
  rejects(craft({ 'document.json': JSON.stringify(minimalDoc({ elements: many })) }), 'too-many-elements');
  rejects(craft({ 'document.json': '[1,2,3]' }), 'bad-document');
});

test('file:// and http(s) picture addresses in the document are never loaded or kept', () => {
  const image = (printUri: string) => ({
    id: 'i', type: 'image', left: 1, top: 1, width: 10, height: 10, rotation: 0, printUri, uri: printUri,
  });
  for (const uri of ['file:///data/user/0/com.sezprint/files/secret.png', 'https://evil.example/x.png', 'content://media/1', 'data:image/png;base64,AAAA', '../assets/images/a.png', 'assets/images/ghost.png']) {
    const parsed = parse(craft({ 'document.json': JSON.stringify(minimalDoc({ elements: [image(uri)] })) }));
    assert.equal(parsed.document.elements.length, 0, uri);
    assert.equal(parsed.missing.filter((m) => m.kind === 'image').length, 1, uri);
  }
  const bg = parse(craft({ 'document.json': JSON.stringify(minimalDoc({ background: { type: 'image', uri: 'https://evil.example/x.png' } })) }));
  assert.equal((bg.document as Rec).background, undefined);
  const ref = parse(craft({ 'document.json': JSON.stringify(minimalDoc({ referenceImage: { fileName: '../../etc/passwd', widthPx: 5, heightPx: 5 } })) }));
  assert.equal((ref.document as Rec).referenceImage, undefined);
});

test('script-like text stays inert text; control characters are stripped', () => {
  const evil = '<script>alert(1)</script>${process.exit()}\u0000\u0007{{__proto__}}';
  const parsed = parse(craft({ 'document.json': JSON.stringify(minimalDoc({ name: evil, elements: [{ ...text(), text: evil }] })) }));
  const el = parsed.document.elements[0] as Rec;
  assert.equal(el.text, '<script>alert(1)</script>${process.exit()}{{__proto__}}');
  assert.equal(parsed.document.name, '<script>alert(1)</script>${process.exit()}{{__proto__}}');
});

test('bad values are replaced or clamped, never crash; invalid elements are skipped and listed', () => {
  const doc = minimalDoc({
    orientation: 45, paperType: 'Glossy', mediaShape: 'blob',
    elements: [
      { ...text(), fontSize: 'big', bold: 'yes', align: 'diagonal', rotation: 'spin' },
      { id: 'x', type: 'text', text: 'no geometry' },
      { id: 'y', type: 'qrcode', left: 1, top: 1, width: 5 }, // no height
      { id: 'z', type: 'table', left: 1, top: 1, width: 5, height: 5, rowCount: 99, columnCount: 2, rowHeights: 'x', columnWidths: [1] },
      { id: 's', type: 'signature', left: 1, top: 1, width: 5, height: 5, strokes: 'nope' },
      'not even an object',
    ],
  });
  const parsed = parse(craft({ 'document.json': JSON.stringify(doc) }));
  assert.equal((parsed.document as Rec).orientation, 0);
  assert.equal((parsed.document as Rec).paperType, 'Label');
  assert.equal((parsed.document as Rec).mediaShape, undefined);
  const first = parsed.document.elements[0] as Rec;
  assert.equal(first.fontSize, 8.5);
  assert.equal(first.bold, false);
  assert.equal(first.align, 'left');
  assert.equal(first.rotation, 0);
  assert.equal(parsed.document.elements.length, 2); // text + table (rowCount clamped to 10)
  const table = parsed.document.elements[1] as Rec;
  assert.equal(table.rowCount, 10);
  assert.equal(table.rowHeights.length, 10);
  assert.equal(table.columnWidths.length, 2);
  assert.ok(parsed.missing.filter((m) => m.kind === 'element-invalid').length >= 3);
});

test('table and signature limits', () => {
  const strokes = Array.from({ length: LIMITS.signatureStrokes + 1 }, () => ({ points: [{ x: 0, y: 0 }], strokeWidth: 0.01 }));
  const sig = { id: 's', type: 'signature', left: 1, top: 1, width: 5, height: 5, strokes };
  assert.equal(parse(craft({ 'document.json': JSON.stringify(minimalDoc({ elements: [sig] })) })).document.elements.length, 0);
  const points = Array.from({ length: LIMITS.signaturePoints + 1 }, () => ({ x: 0.1, y: 0.1 }));
  const sig2 = { ...sig, strokes: [{ points, strokeWidth: 0.01 }] };
  assert.equal(parse(craft({ 'document.json': JSON.stringify(minimalDoc({ elements: [sig2] })) })).document.elements.length, 0);
});

// ───────────── SVG ─────────────

test('strict SVG: safe art passes, everything dangerous is refused', () => {
  assert.ok(sanitizeSvgStrict(SAFE_SVG));
  assert.ok(sanitizeSvgStrict('<?xml version="1.0"?><!-- c --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="5" height="5" fill="url(#g)"/></svg>'));
  const bad = [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil/x.svg#a"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" onclick="x()"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(http://evil/x.css)</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" style="fill:url(http://evil/a)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url(https://evil/a)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="javascript:alert(1)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg"><path d="&b;"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="&custom;"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><![CDATA[x]]></svg>',
    '<svg xmlns="http://www.w3.org/1999/xhtml"><path d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="x"><path d="M0 0"/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg><svg/>',
    '<svg xmlns="http://www.w3.org/2000/svg">text<path d="M0 0"/></svg>',
    '<html><body/></html>',
    'plain text',
    '',
  ];
  for (const svg of bad) assert.equal(sanitizeSvgStrict(svg), null, svg.slice(0, 70));
  assert.equal(sanitizeSvgStrict('<svg xmlns="http://www.w3.org/2000/svg">' + '<g>'.repeat(60) + '</g>'.repeat(60) + '</svg>'), null, 'depth');
  assert.equal(sanitizeSvgStrict(SAFE_SVG + ' '.repeat(LIMITS.svgBytes)), null, 'size');
  // Output is rebuilt: unknown attributes are dropped.
  assert.ok(!sanitizeSvgStrict('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" data-x="1" fooBar="2"/></svg>')!.includes('data-x'));
});

test('an unsafe clipart SVG inside a package is dropped and listed, the rest imports', () => {
  const doc = JSON.stringify(minimalDoc({ elements: [{ id: 'c', type: 'clipart', clipartId: 'svg_bad', left: 1, top: 1, width: 5, height: 5 }] }));
  const parsed = parse(craft(
    { 'document.json': doc, 'assets/clipart/bad.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
    { userClipart: [{ id: 'svg_bad', label: 'Bad one', kind: 'svg', path: 'assets/clipart/bad.svg' }] },
  ));
  assert.equal(parsed.userClipart.length, 0);
  assert.ok(parsed.missing.some((m) => m.kind === 'user-clipart' && m.name === 'Bad one'));
  assert.equal(parsed.document.elements.length, 1);
});

test('failure writes nothing: parsing is pure (no file API is touched)', () => {
  // import.ts, schema.ts, zip.ts, finalize.ts have no React Native / file-system imports.
  // A failed parse throws before any caller-side commit; the native commit is covered by the device checklist.
  assert.throws(() => parse(strToU8('nope')));
});

test('full export is a valid, parseable package (sanity)', async () => {
  const phone = new FakePhone();
  const out = await buildSezlabel(fullDocument(phone), phone.exportEnv());
  assert.doesNotThrow(() => readZip(out.bytes));
  assert.ok(out.bytes.length < LIMITS.fileBytes);
});

// ───────────── fonts ─────────────

test('fonts: fake, truncated, oversized, mismatched or collection fonts are rejected', () => {
  const doc = goodDoc();
  rejects(craft({ 'document.json': doc, 'assets/fonts/a.ttf': '<html>not a font</html>'.repeat(5) }), 'bad-font');
  rejects(craft({ 'document.json': doc, 'assets/fonts/a.ttf': makeFont('ttf').slice(0, 40) }), 'bad-font');
  rejects(craft({ 'document.json': doc, 'assets/fonts/a.otf': makeFont('ttf') }), 'bad-font'); // extension lies
  rejects(craft({ 'document.json': doc, 'assets/fonts/a.ttf': makeFont('otf') }), 'bad-font');
  const ttc = makeFont('ttf');
  ttc.set([0x74, 0x74, 0x63, 0x66], 0);
  rejects(craft({ 'document.json': doc, 'assets/fonts/a.ttf': ttc }), 'bad-font');
  // A table that points outside the file.
  const outside = makeFont('ttf');
  new DataView(outside.buffer).setUint32(12 + 8, 0x7fffffff);
  rejects(craft({ 'document.json': doc, 'assets/fonts/a.ttf': outside }), 'bad-font');
  // Zero-filled font over the size limit: refused by size/ratio before it is inflated.
  const huge = makeFont('ttf', LIMITS.fontBytes + 10);
  rejects(craft({ 'document.json': doc, 'assets/fonts/a.ttf': huge }), /entry-too-large|ratio/);
  // A font path outside the fonts folder, or with a bad name.
  rejects(craft({ 'document.json': doc, 'assets/fonts/sub/a.ttf': makeFont('ttf') }), 'bad-name');
  rejects(craft({ 'document.json': doc, 'assets/fonts/../a.ttf': makeFont('ttf') }), 'bad-name');
});

test('fonts: a manifest cannot make an image or an unrelated file a font, and unknown family names are not installed', () => {
  const doc = JSON.stringify(minimalDoc({ elements: [{ ...text(), fontFamily: 'Fancy' }] }));
  const png = makePng(4, 4);
  const parsed = parse(craft(
    { 'document.json': doc, 'assets/images/p.png': png, 'assets/fonts/f.ttf': makeFont('ttf') },
    { fontFiles: [
      { family: 'Fancy', path: 'assets/images/p.png' }, // not a font
      { family: 'Other', path: 'assets/fonts/f.ttf' }, // a name the label does not use
    ] },
  ), importEnv({ isFontAvailable: (n) => n === 'Default' }));
  assert.equal(parsed.fonts.length, 0);
  assert.deepEqual(parsed.missing.filter((m) => m.kind === 'font').map((m) => m.name), ['Fancy']);
});

test('fonts: more than 8 are ignored', () => {
  const parts: Record<string, Uint8Array | string> = { 'document.json': goodDoc() };
  const fontFiles: Rec[] = [];
  for (let i = 0; i < 12; i++) {
    const f = makeFont('ttf', 400 + i);
    parts[`assets/fonts/f${i}.ttf`] = f;
    fontFiles.push({ family: `F${i}`, path: `assets/fonts/f${i}.ttf` });
  }
  const parsed = parse(craft(parts, { fontFiles }));
  assert.equal(parsed.fonts.length, 0); // none of them is used by the label
});
