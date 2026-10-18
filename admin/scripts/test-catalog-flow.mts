// End-to-end check of the clipart / template catalogue: storage, SVG sanitiser, categories, items, screen API, app sync.
// Needs the admin server on BASE (default http://localhost:3000). Never touches AWS: the S3 driver is only
// checked offline (signing a POST policy needs no network). Removes everything it made (also on --cleanup).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { LocalStorage } from '../src/lib/storage/local.ts';
import { S3Storage } from '../src/lib/storage/s3.ts';
import { storage } from '../src/lib/storage/index.ts';
import { createAppToken } from '../src/lib/app-session.ts';
import { hashAppPassword } from '../src/lib/app-passwords.ts';
import { sanitizeSvg, MAX_SVG_BYTES } from '../src/lib/catalog/sanitize-svg.ts';
import { renderThumbnail } from '../src/lib/catalog/thumbnail.ts';
import { parseSvgDrawOps } from '../../src/lib/clipart/parse-svg.ts';
import { BASE, call, checker, createAdmins, login, prisma, type TestAdmin } from './lib/testkit.mts';

const ADMINS: TestAdmin[] = [
  { id: 'adm_flowtest_c_super', email: 'flow-c-super@sez.local', role: 'superadmin', password: 'Flow-C-Super-123!' },
  { id: 'adm_flowtest_c_content', email: 'flow-c-content@sez.local', role: 'content', password: 'Flow-C-Content-123!' },
  { id: 'adm_flowtest_c_support', email: 'flow-c-support@sez.local', role: 'support', password: 'Flow-C-Support-123!' },
];
const KEY_DIR = 'catalog/flowtest';

async function cleanup() {
  const cats = await prisma.catalogCategory.findMany({ where: { name: { startsWith: 'FlowC' } }, select: { id: true } });
  const items = await prisma.catalogItem.findMany({ where: { OR: [{ name: { startsWith: 'FlowC' } }, { categoryId: { in: cats.map((c) => c.id) } }] }, select: { id: true } });
  await prisma.catalogTombstone.deleteMany({ where: { itemId: { in: items.map((i) => i.id) } } });
  await prisma.catalogItem.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
  await prisma.catalogCategory.deleteMany({ where: { id: { in: cats.map((c) => c.id) } } });
  await prisma.catalogTombstone.deleteMany({ where: { itemId: { startsWith: 'flowc-old-' } } });
  await prisma.appConfig.deleteMany({ where: { key: 'catalogTombstoneFloor' } });
  await prisma.user.deleteMany({ where: { mobile: '9000000041' } });
  await prisma.registeredPhone.deleteMany({ where: { mobile: '9000000041' } });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { startsWith: 'adm_flowtest_c_' } } });
  await prisma.adminAccount.deleteMany({ where: { id: { startsWith: 'adm_flowtest_c_' } } });
  await fs.rm(path.join(process.cwd(), 'data', 'catalog', KEY_DIR), { recursive: true, force: true });
  await fs.rm(path.join(process.cwd(), 'data', 'catalog', 'staging', 'flowtest.svg'), { force: true });
  for (const id of items.map((i) => i.id)) await fs.rm(path.join(process.cwd(), 'data', 'catalog', 'catalog', 'clipart', id), { recursive: true, force: true }).catch(() => {});
  for (const id of items.map((i) => i.id)) await fs.rm(path.join(process.cwd(), 'data', 'catalog', 'catalog', 'template', id), { recursive: true, force: true }).catch(() => {});
}
if (process.argv.includes('--cleanup')) {
  await cleanup();
  console.log('cleanup done');
  process.exit(0);
}
await cleanup();

const { check, finish } = checker();
console.log(`Checking ${BASE}\n`);

// ───────── E1: storage ─────────
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sez-storage-'));
const local = new LocalStorage(tmp, 'http://example.test');
await local.put('catalog/a/x.svg', Buffer.from('<svg/>'), { contentType: 'image/svg+xml' });
const got = await local.get('catalog/a/x.svg');
await local.copy('catalog/a/x.svg', 'catalog/a/y.svg');
const copied = await local.exists('catalog/a/y.svg');
await local.delete('catalog/a/x.svg');
check('local storage: put, get, copy, exists, delete', got?.body.toString() === '<svg/>' && got.contentType === 'image/svg+xml' && copied && !(await local.exists('catalog/a/x.svg')) && (await local.get('catalog/a/x.svg')) === null);
const bad = ['../x.svg', '/etc/passwd', 'catalog/../../x.svg', 'other/a.svg', 'catalog/a b.svg', 'catalog//a.svg', 'catalog/a/', 'catalog/a\\b.svg', ''];
const rejected = await Promise.all(bad.map((k) => local.put(k, Buffer.from('x'), { contentType: 'x' }).then(() => false, () => true)));
check('local storage: unsafe keys are refused', rejected.every(Boolean), rejected.map((r) => (r ? 'x' : 'ok')).join(''));
check('local storage: public URL and no presigned upload', local.publicUrl('catalog/a/y.svg') === 'http://example.test/api/catalog-files/catalog/a/y.svg' && (await local.presignUpload()) === null);
await fs.rm(tmp, { recursive: true, force: true });

const s3 = new S3Storage({ bucket: 'sezprint-catalog-test', region: 'ap-south-1', endpoint: 'http://127.0.0.1:9', forcePathStyle: true, accessKeyId: 'AKIAEXAMPLEEXAMPLE0', secretAccessKey: 'example-secret-example-secret-example00', publicBaseUrl: 'https://cdn.example.test/' });
const up = await s3.presignUpload({ contentType: 'image/svg+xml', maxBytes: 500_000, expiresInSeconds: 300 });
const policy = JSON.parse(Buffer.from(up!.fields.Policy ?? up!.fields.policy, 'base64').toString());
const conds = JSON.stringify(policy.conditions);
check('S3 driver: presigned POST limits size (1..500000 bytes) and type, only into staging/',
  conds.includes('["content-length-range",1,500000]') && conds.includes('"Content-Type":"image/svg+xml"') || conds.includes('["eq","$Content-Type","image/svg+xml"]'), conds.slice(0, 200));
check('S3 driver: bucket, staging key and short expiry in the policy',
  conds.includes('sezprint-catalog-test') && up!.key.startsWith('staging/') && up!.key.endsWith('.svg') && Date.parse(policy.expiration) - Date.now() < 6 * 60_000 && up!.url.includes('sezprint-catalog-test'));
check('S3 driver: public URL goes through the CDN address; unsafe keys refused', s3.publicUrl('catalog/clipart/1/abc.svg') === 'https://cdn.example.test/catalog/clipart/1/abc.svg' && (await s3.put('../x', Buffer.from('x'), { contentType: 'x' }).then(() => false, () => true)));
process.env.STORAGE_DRIVER_BACKUP = process.env.STORAGE_DRIVER ?? '';
check('configured storage in this environment is the local driver', storage().driver === 'local');

// served files (headers CloudFront will add in production)
const secrets = await createAdmins(ADMINS);
const [sup, content, support] = [await login(ADMINS[0], secrets[ADMINS[0].id]), await login(ADMINS[1], secrets[ADMINS[1].id]), await login(ADMINS[2], secrets[ADMINS[2].id])];
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
await storage().put(`${KEY_DIR}/ft.svg`, Buffer.from(svg), { contentType: 'image/svg+xml' });
await storage().put('staging/flowtest.svg', Buffer.from(svg), { contentType: 'image/svg+xml' });
const pub = await fetch(`${BASE}/api/catalog-files/${KEY_DIR}/ft.svg`);
const h = pub.headers;
check('served file: svg type, nosniff, sandbox CSP, cached forever',
  pub.status === 200 && h.get('content-type') === 'image/svg+xml' && h.get('x-content-type-options') === 'nosniff'
  && h.get('content-security-policy') === "default-src 'none'; style-src 'unsafe-inline'; sandbox" && /immutable/.test(h.get('cache-control') ?? '') && (await pub.text()) === svg);
check('served file: waiting uploads need a session (401 without, 200 with)',
  (await fetch(`${BASE}/api/catalog-files/staging/flowtest.svg`)).status === 401 && (await fetch(`${BASE}/api/catalog-files/staging/flowtest.svg`, { headers: { cookie: content } })).status === 200);
const trav = await Promise.all(['catalog/..%2f..%2fpackage.json', 'catalog/%2e%2e/%2e%2e/package.json', 'catalog/nope/missing.svg', 'other/x.svg'].map(async (k) => (await fetch(`${BASE}/api/catalog-files/${k}`)).status));
check('served file: traversal attempts and missing files never return a file (404, or 401 when the client already collapsed the ..)', trav.every((s) => s === 404 || s === 401), trav.join(','));

// ───────── E2: SVG sanitiser ─────────
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ok = (r: ReturnType<typeof sanitizeSvg>) => (r.ok ? r : (() => { throw new Error('expected ok, got ' + JSON.stringify(r)); })());
const hostile = sanitizeSvg(`<svg ${NS} viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><circle cx="5" cy="5" r="4" onclick="x()" ONMOUSEOVER="y()"/></svg>`);
check('script, onload and other event attributes are removed, the shape stays',
  hostile.ok && !/script|onload|onclick|onmouseover|alert/i.test(hostile.svg) && hostile.svg.includes('<circle') && hostile.removed.some((r) => r.what === '<script>') && hostile.removed.filter((r) => r.what.startsWith('event handler')).length === 3, hostile.ok ? hostile.svg.slice(0, 120) : '');
if (hostile.ok) console.log('      diff: before  <svg onload="alert(1)"><script>alert(1)</script><circle onclick="x()" ONMOUSEOVER="y()"/></svg>\n            after   ' + hostile.svg);
const fo = sanitizeSvg(`<svg ${NS} viewBox="0 0 10 10"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject><iframe src="x"/><path d="M0 0L5 5"/></svg>`);
check('foreignObject and iframe are removed with their contents', fo.ok && !/foreignObject|iframe|div/.test(fo.svg) && fo.svg.includes('<path'));
const links = sanitizeSvg(`<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><use xlink:href="http://evil.test/a.svg#a"/><use href="#ok"/><image href="http://evil.test/x.png"/><a href="javascript:alert(1)"><path d="M0 0L5 5"/></a><rect id="ok" x="0" y="0" width="3" height="3" fill="url(http://evil.test/g)"/></svg>`);
check('external links, javascript: links and external paint are removed; local #refs and the shapes inside links stay',
  links.ok && !/evil|javascript/.test(links.svg) && links.svg.includes('href="#ok"') && links.svg.includes('<path') && !links.svg.includes('<image') && !links.svg.includes('<a '), links.ok ? links.svg.slice(0, 200) : '');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const img = sanitizeSvg(`<svg ${NS} viewBox="0 0 10 10"><image href="data:image/png;base64,${png}" width="5" height="5"/><circle cx="5" cy="5" r="2"/></svg>`);
const html = sanitizeSvg(`<svg ${NS} viewBox="0 0 10 10"><image href="data:text/html;base64,PHNjcmlwdD4=" width="5" height="5"/><circle cx="5" cy="5" r="2"/></svg>`);
const big = sanitizeSvg(`<svg ${NS} viewBox="0 0 10 10"><image href="data:image/png;base64,${'A'.repeat(210_000)}"/><circle cx="5" cy="5" r="2"/></svg>`);
check('embedded pictures: small png/jpeg data URIs kept; html data URIs and pictures over 150 KB removed',
  img.ok && img.svg.includes('data:image/png') && html.ok && !html.svg.includes('<image') && big.ok && !big.svg.includes('<image'));
const css = sanitizeSvg(`<svg ${NS} viewBox="0 0 10 10"><style>@import url(http://evil.test/x.css); path{fill:red}</style><path d="M0 0L5 5" style="fill:red;background:url(http://evil.test/i.png);stroke:url(#g);behavior:url(x.htc)" fill="url(#g)"/></svg>`);
check('<style> blocks are removed; style attributes keep only safe properties with local url(#…)',
  css.ok && !/evil|@import|background|behavior|<style/.test(css.svg) && css.svg.includes('fill:red') && css.svg.includes('stroke:url(#g)') && css.warnings.some((w) => w.includes('<style>')), css.ok ? css.svg : '');
const foreign = sanitizeSvg(`<svg ${NS} xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" viewBox="0 0 10 10"><sodipodi:namedview/><path inkscape:label="x" d="M0 0L5 5" data-x="1"/></svg>`);
check('editor leftovers (inkscape / sodipodi / data-*) are dropped', foreign.ok && !/inkscape|sodipodi|data-x/.test(foreign.svg) && foreign.svg.includes('<path'));
const fails: [string, string, string | Buffer][] = [
  ['DOCTYPE', 'entity bomb (DOCTYPE + entities)', '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>&b;</text></svg>'],
  ['NOT_SVG', 'html page', '<html><body>hi</body></html>'],
  ['INVALID_XML', 'broken xml', '<svg viewBox="0 0 1 1"><path d="M0 0"></svg'],
  ['EMPTY_FILE', 'empty file', ''],
  ['TOO_LARGE', 'over 500 KB', `<svg ${NS} viewBox="0 0 1 1"><path d="${'M0 0L1 1'.repeat(MAX_SVG_BYTES / 8 + 10)}"/></svg>`],
  ['TOO_DEEP', 'nested 60 levels', `<svg ${NS} viewBox="0 0 1 1">${'<g>'.repeat(60)}<path d="M0 0L1 1"/>${'</g>'.repeat(60)}</svg>`],
  ['TOO_COMPLEX', '6000 elements', `<svg ${NS} viewBox="0 0 1 1">${'<path d="M0 0L1 1"/>'.repeat(6000)}</svg>`],
  ['NO_SIZE', 'no viewBox or size', `<svg ${NS}><path d="M0 0L1 1"/></svg>`],
  ['NOTHING_DRAWABLE', 'only text (the app cannot draw it)', `<svg ${NS} viewBox="0 0 10 10"><text x="1" y="5">Hello</text></svg>`],
  ['NOT_TEXT', 'binary data', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1])],
];
const results = fails.map(([code, , body]) => sanitizeSvg(body));
check('hostile or unusable files are refused with a clear code: ' + fails.map((f) => f[0]).join(', '),
  results.every((r, i) => !r.ok && r.code === fails[i][0]), results.map((r) => (r.ok ? 'OK?!' : r.code)).join(','));
const sample = `<?xml version="1.0" encoding="UTF-8"?>\n\uFEFF<!-- made in an editor --><svg ${NS} width="50mm" height="30mm" viewBox="0 0 50 30"><g><path d="M2 2h20v10H2z" fill="none" stroke="#000" stroke-width="1"/><circle cx="35" cy="15" r="8"/><rect x="2" y="16" width="20" height="10" rx="2"/><ellipse cx="30" cy="25" rx="4" ry="2"/><line x1="0" y1="0" x2="50" y2="30"/><polygon points="40,2 48,2 44,10"/></g></svg>`;
const clean = ok(sanitizeSvg(sample));
check('a normal file keeps every shape: same drawable shapes before and after (app parser)', parseSvgDrawOps(sample).length === 6 && clean.drawOps === 6 && parseSvgDrawOps(clean.svg).length === 6, `${clean.drawOps}`);
check('size read from the file: 50mm x 30mm, viewBox kept, hash is sha256 of the cleaned text',
  clean.widthMm === 50 && clean.heightMm === 30 && clean.viewBox === '0 0 50 30' && /^[0-9a-f]{64}$/.test(clean.hash) && clean.svg.startsWith('<svg') && clean.svg.includes('xmlns="http://www.w3.org/2000/svg"'));
const sizes = [
  sanitizeSvg(`<svg ${NS} width="2in" height="1in"><circle cx="1" cy="1" r="1"/></svg>`),
  sanitizeSvg(`<svg ${NS} viewBox="0 0 100 60"><circle cx="1" cy="1" r="1"/></svg>`),
  sanitizeSvg(`<svg ${NS} width="5cm" height="30"><circle cx="1" cy="1" r="1"/></svg>`),
];
check('size units: 2in x 1in = 50.8 x 25.4 mm; viewBox only = pixels at 96 dpi; 5cm x 30px', sizes.every((r) => r.ok)
  && sizes[0].ok && sizes[0].widthMm === 50.8 && sizes[0].heightMm === 25.4
  && sizes[1].ok && sizes[1].widthMm === 26.46 && sizes[1].heightMm === 15.88
  && sizes[2].ok && sizes[2].widthMm === 50 && sizes[2].heightMm === 7.94);
const warn = sanitizeSvg(`<svg ${NS} viewBox="0 0 10 10"><g transform="translate(1 1)"><path d="M0 0L5 5"/></g><linearGradient id="g"/></svg>`);
check('things the app ignores are reported, not hidden (transform, gradients)', warn.ok && warn.unsupportedForApp.includes('transform') && warn.unsupportedForApp.includes('<linearGradient>') && warn.warnings.length > 0);
const thumb = await renderThumbnail(clean.svg, 128);
check('thumbnail: a PNG is rendered from the cleaned file', !!thumb && thumb.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && thumb.length > 200, `${thumb?.length} bytes`);

// ───────── E3: categories and items ─────────
const formOf = (files: [string, string][]) => { const f = new FormData(); for (const [name, body] of files) f.append('files', new File([body], name, { type: 'image/svg+xml' })); return f; };
const hostileSvg = `<svg ${NS} viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>`;
const upl = await call('POST', '/api/catalog/uploads', { cookie: content, form: formOf([['paw_print.svg', sample], ['evil.svg', hostileSvg], ['page.svg', '<html>no</html>'], ['notes.txt', 'hello']]) });
if (!upl.body.results) console.log("UPLOAD FAILED", upl.status, JSON.stringify(upl.body).slice(0, 300));
const [u1, u2, u3, u4] = upl.body.results;
check('upload: three kinds of result — cleaned, cleaned-with-removals, refused (not svg xml / not .svg)',
  upl.status === 200 && u1.ok && u2.ok && u2.removed.some((r: any) => r.what === '<script>') && !u3.ok && u3.code === 'NOT_SVG' && !u4.ok && u4.code === 'NOT_SVG', JSON.stringify(upl.body.results.map((r: any) => r.ok ? 'ok' : r.code)));
check('upload: detected size 50 x 30 mm, suggested name from the file name, preview address', u1.widthMm === 50 && u1.heightMm === 30 && u1.suggestedName === 'paw print' && u1.previewUrl.includes('/api/catalog-files/staging/'));
const stagedCopy = await (await fetch(u2.previewUrl, { headers: { cookie: content } })).text();
check('upload: the file waiting in staging is already the cleaned one (no script, no onload)', !/script|onload|alert/.test(stagedCopy));

const mkCat = (kind: string, name: string, cookie = content) => call('POST', '/api/catalog/categories', { cookie, body: { kind, name } });
const catA = await mkCat('clipart', 'FlowC Animals');
const catT = await mkCat('template', 'FlowC Jewellery');
check('categories: create for clipart and for templates; same name twice -> 409; unknown kind -> 400',
  catA.status === 201 && catT.status === 201 && (await mkCat('clipart', 'flowc animals')).status === 409 && (await mkCat('sticker', 'x')).status === 400);
const catsList = await call('GET', '/api/catalog/categories?kind=clipart', { cookie: support });
check('categories: list per kind with item counts (support can read)', catsList.body.categories.some((c: any) => c.name === 'FlowC Animals' && c.items === 0) && catsList.body.categories.every((c: any) => c.kind === 'clipart'));
check('permissions: support can read the library but not write; no session -> 401',
  (await mkCat('clipart', 'FlowC Nope', support)).status === 403 && (await call('POST', '/api/catalog/uploads', { cookie: support, form: formOf([['a.svg', sample]]) })).status === 403 && (await call('GET', '/api/catalog/categories')).status === 401);

const published = await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: u1.stagingKey, name: 'FlowC Paw', categoryId: catA.body.category.id, kind: 'clipart', status: 'published' } });
const item = published.body.item;
const storedSvg = await (await fetch(item.svgUrl)).text();
const thumbRes = await fetch(item.thumbUrl);
check('publish: item saved with hashed address, cleaned SVG served, PNG thumbnail served, staging copy removed',
  published.status === 201 && item.svgUrl.includes(item.contentHash) && storedSvg.includes('<circle') && thumbRes.headers.get('content-type') === 'image/png' && (await fetch(u1.previewUrl, { headers: { cookie: content } })).status === 404, `${published.status} ${JSON.stringify(published.body).slice(0, 100)}`);
const badKind = await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: u2.stagingKey, name: 'FlowC Evil', categoryId: catT.body.category.id, kind: 'clipart' } });
const noName = await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: u2.stagingKey, name: ' ', categoryId: catA.body.category.id, kind: 'clipart' } });
const fakeKey = await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: '../../etc/passwd', name: 'x', categoryId: catA.body.category.id, kind: 'clipart' } });
check('publish: category of the wrong kind, empty name and a made-up upload reference are refused (400)', badKind.status === 400 && noName.status === 400 && fakeKey.status === 400, `${badKind.status}/${noName.status}/${fakeKey.status}`);
const twin = await call('POST', '/api/catalog/uploads', { cookie: content, form: formOf([['again.svg', sample]]) });
check('duplicate detection: the same picture uploaded again points to the existing item', twin.body.results[0].duplicateOf?.id === item.id);

const tpl = await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: twin.body.results[0].stagingKey, name: 'FlowC Tag 50x30', categoryId: catT.body.category.id, kind: 'template', status: 'published' } });
check('template: size taken from the file (50 x 30 mm)', tpl.status === 201 && tpl.body.item.widthMm === 50 && tpl.body.item.heightMm === 30);
const tplOverride = await call('POST', '/api/catalog/uploads', { cookie: content, form: formOf([['t2.svg', sample.replace('M2 2h20v10H2z', 'M3 3h20v10H3z')]]) });
const tplNoSize = await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: tplOverride.body.results[0].stagingKey, name: 'FlowC Tag zero', categoryId: catT.body.category.id, kind: 'template', widthMm: 0, heightMm: 0 } });
const tplBig = await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: tplOverride.body.results[0].stagingKey, name: 'FlowC Tag 40x40', categoryId: catT.body.category.id, kind: 'template', widthMm: 40, heightMm: 40 } });
check('template: admin can override the size; a zero size is refused', tplNoSize.status === 400 && tplBig.status === 201 && tplBig.body.item.widthMm === 40 && tplBig.body.item.heightMm === 40);

// edit
const r0 = published.body.item.revision;
const ren = await call('PATCH', `/api/catalog/items/${item.id}`, { cookie: content, body: { name: 'FlowC Paw Print' } });
const stale = await fetch(`${BASE}/api/catalog/items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: content, 'If-Match': String(r0) }, body: JSON.stringify({ name: 'FlowC Stale' }) });
const fresh = await fetch(`${BASE}/api/catalog/items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: content, 'If-Match': String(ren.body.item.revision) }, body: JSON.stringify({ status: 'draft' }) });
check('edit: rename bumps the revision; a stale If-Match is refused (412); a fresh one works',
  ren.status === 200 && ren.body.item.name === 'FlowC Paw Print' && ren.body.item.revision > r0 && stale.status === 412 && fresh.status === 200);
const catB = await mkCat('clipart', 'FlowC Birds');
const move = await call('PATCH', `/api/catalog/items/${item.id}`, { cookie: content, body: { categoryId: catB.body.category.id } });
const moveBad = await call('PATCH', `/api/catalog/items/${item.id}`, { cookie: content, body: { categoryId: catT.body.category.id } });
check('edit: move to another category of the same kind; across kinds refused', move.status === 200 && move.body.item.categoryId === catB.body.category.id && moveBad.status === 400);
const delBusy = await call('DELETE', `/api/catalog/categories/${catB.body.category.id}`, { cookie: content });
check('categories: deleting a category that still has items -> 409 with the count', delBusy.status === 409 && /1 item/.test(delBusy.body.error), delBusy.body.error);
const renCat = await call('PATCH', `/api/catalog/categories/${catA.body.category.id}`, { cookie: content, body: { name: 'FlowC Animals & Pets' } });
check('categories: rename', renCat.status === 200 && renCat.body.category.name === 'FlowC Animals & Pets');

// replace
const oldUrl = item.svgUrl;
const newPic = sample.replace('r="8"', 'r="9"');
const up2 = await call('POST', '/api/catalog/uploads', { cookie: content, form: formOf([['paw2.svg', newPic]]) });
const rep = await call('POST', `/api/catalog/items/${item.id}/replace`, { cookie: content, body: { stagingKey: up2.body.results[0].stagingKey } });
const same = await call('POST', '/api/catalog/uploads', { cookie: content, form: formOf([['same.svg', newPic]]) });
const repSame = await call('POST', `/api/catalog/items/${item.id}/replace`, { cookie: content, body: { stagingKey: same.body.results[0].stagingKey } });
check('replace: version 2 at a new hashed address; the old address still serves; same picture again -> 409',
  rep.status === 200 && rep.body.item.version === 2 && rep.body.item.svgUrl !== oldUrl && (await fetch(oldUrl)).status === 200 && (await fetch(rep.body.item.svgUrl)).status === 200 && repSame.status === 409);

// delete
const revBefore = (await prisma.appConfig.findUnique({ where: { key: 'catalogRevision' } }))!.value as number;
const del = await call('DELETE', `/api/catalog/items/${item.id}`, { cookie: content });
const gone = await prisma.catalogItem.findUnique({ where: { id: item.id } });
const tomb = await prisma.catalogTombstone.findUnique({ where: { itemId: item.id } });
const list = await call('GET', `/api/catalog/items?kind=clipart&q=FlowC`, { cookie: content });
check('delete: soft delete with a tombstone at a new revision; file kept; item no longer listed',
  del.status === 200 && !!gone?.deletedAt && !!tomb && tomb.revision > revBefore && (await fetch(rep.body.item.svgUrl)).status === 200 && !list.body.items.some((i: any) => i.id === item.id));
const delEmpty = await call('DELETE', `/api/catalog/categories/${catB.body.category.id}`, { cookie: content });
check('categories: an emptied category can be deleted', delEmpty.status === 200);
const search = await call('GET', '/api/catalog/items?kind=template&q=tag', { cookie: support });
const searchPub = await call('GET', '/api/catalog/items?kind=template&q=tag&status=published', { cookie: support });
check('library list: search by name, filter by kind and by status (support can read)',
  search.body.items.length === 2 && search.body.items.every((i: any) => i.kind === 'template') && searchPub.body.items.length === 1 && searchPub.body.items[0].name === 'FlowC Tag 50x30');
const acts = new Set((await prisma.adminAuditLog.findMany({ where: { adminId: 'adm_flowtest_c_content' } })).map((a) => a.action));
check('audit: uploads, publishing, edits, replace, delete and category changes are recorded',
  ['catalog.upload', 'catalog.item.create', 'catalog.item.update', 'catalog.item.replace', 'catalog.item.delete', 'catalog.category.create', 'catalog.category.update', 'catalog.category.delete'].every((a) => acts.has(a)), [...acts].join(','));

// ───────── E5: app sync ─────────
const appUser = await prisma.user.create({ data: { name: 'FlowC Reader', mobile: '9000000041', passwordHash: await hashAppPassword('Sup3r-secret!') } });
const appTok = createAppToken(appUser.id, appUser.tokenVersion);
const sync = (since: number | string, token = appTok) => call('GET', `/api/v1/catalog?since=${since}`, { token });
const mkItem = async (name: string, cat: string, kind: string, status = 'published', svgText = sample) => {
  const u = await call('POST', '/api/catalog/uploads', { cookie: content, form: formOf([[`${name}.svg`, svgText]]) });
  return (await call('POST', '/api/catalog/items', { cookie: content, body: { stagingKey: u.body.results[0].stagingKey, name, categoryId: cat, kind, status } })).body.item;
};
const syncCat = (await mkCat('clipart', 'FlowC Sync')).body.category;
const sy0 = await sync(0);
const flowCats0 = sy0.body.categories.filter((c: any) => c.name.startsWith('FlowC'));
check('sync: first call is a full download with every category; no token -> 401', sy0.status === 200 && sy0.body.fullResync === true && sy0.body.deletedItemIds.length === 0 && flowCats0.some((c: any) => c.id === syncCat.id) && (await call('GET', '/api/v1/catalog')).status === 401);
const a1 = await mkItem('FlowC Sync A', syncCat.id, 'clipart', 'published', sample.replace('r="8"', 'r="7"'));
const a2 = await mkItem('FlowC Sync B (draft)', syncCat.id, 'clipart', 'draft', sample.replace('r="8"', 'r="6"'));
const sy1 = await sync(sy0.body.revision);
check('sync: only the new published item arrives; drafts are never sent', sy1.body.fullResync === false && sy1.body.items.map((i: any) => i.id).join() === a1.id && sy1.body.revision > sy0.body.revision);
check('sync: item carries what the app needs (size, hash, version, svg + thumbnail addresses that work)',
  sy1.body.items[0].contentHash === a1.contentHash && sy1.body.items[0].version === 1 && (await fetch(sy1.body.items[0].svgUrl)).status === 200 && (await fetch(sy1.body.items[0].thumbUrl)).status === 200 && !('status' in sy1.body.items[0]));
check('sync: nothing changed -> empty delta', (await sync(sy1.body.revision)).body.items.length === 0 && (await sync(sy1.body.revision)).body.deletedItemIds.length === 0);
await call('PATCH', `/api/catalog/items/${a1.id}`, { cookie: content, body: { name: 'FlowC Sync A renamed' } });
const sy2 = await sync(sy1.body.revision);
check('sync: a rename arrives as a changed item', sy2.body.items.length === 1 && sy2.body.items[0].name === 'FlowC Sync A renamed');
await call('PATCH', `/api/catalog/items/${a2.id}`, { cookie: content, body: { status: 'published' } });
const sy3 = await sync(sy2.body.revision);
check('sync: publishing a draft makes it arrive', sy3.body.items.map((i: any) => i.id).join() === a2.id);
await call('PATCH', `/api/catalog/items/${a2.id}`, { cookie: content, body: { status: 'draft' } });
await call('DELETE', `/api/catalog/items/${a1.id}`, { cookie: content });
const sy4 = await sync(sy3.body.revision);
check('sync: deleted and un-published items are listed as ids to remove', sy4.body.items.length === 0 && sy4.body.deletedItemIds.sort().join() === [a1.id, a2.id].sort().join());
const full = await sync(0);
check('sync: a full download has neither deleted nor draft items', !full.body.items.some((i: any) => [a1.id, a2.id].includes(i.id)));
// old deletion history is forgotten after 90 days; a client older than that must re-download everything
await prisma.catalogTombstone.create({ data: { itemId: 'flowc-old-1', revision: 3, deletedAt: new Date(Date.now() - 100 * 86_400_000) } });
const behind = await sync(1);
const current = await sync(full.body.revision);
check('sync: a client older than the 90-day deletion history gets fullResync; an up-to-date client does not', behind.body.fullResync === true && current.body.fullResync === false, `floor ${(await prisma.appConfig.findUnique({ where: { key: 'catalogTombstoneFloor' } }))?.value}`);
await prisma.user.update({ where: { id: appUser.id }, data: { status: 'blocked', tokenVersion: { increment: 1 } } });
check('sync: a blocked user is refused (403 USER_BLOCKED)', (await sync(0)).status === 403);

// ──SECTIONS-BELOW──

await cleanup();
await finish();
