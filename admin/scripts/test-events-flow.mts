// End-to-end check of POST /api/v1/events (print jobs, printer connections, shop clicks, feedback).
// Needs the admin server on BASE (default http://localhost:3000) and the local database. Never sends an SMS.
// Creates two throw-away users and removes everything it made when it finishes (also on --cleanup).
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

import { createAppToken } from '../src/lib/app-session.ts';
import { hashAppPassword } from '../src/lib/app-passwords.ts';

process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
const BASE = process.env.BASE ?? 'http://localhost:3000';
const prisma = new PrismaClient();
const NUMBERS = ['9000000021', '9000000022'];
const PREFIX = 'ft-';

async function cleanup() {
  const users = await prisma.user.findMany({ where: { mobile: { in: NUMBERS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.printEvent.deleteMany({ where: { OR: [{ eventId: { startsWith: PREFIX } }, { userId: { in: ids } }] } });
  await prisma.printerConnection.deleteMany({ where: { OR: [{ eventId: { startsWith: PREFIX } }, { userId: { in: ids } }] } });
  await prisma.productClick.deleteMany({ where: { eventId: { startsWith: PREFIX } } });
  await prisma.feedback.deleteMany({ where: { eventId: { startsWith: PREFIX } } });
  await prisma.userPrinter.deleteMany({ where: { userId: { in: ids } } });
  await prisma.printer.deleteMany({ where: { nameRaw: { startsWith: 'FlowTest' } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.registeredPhone.deleteMany({ where: { mobile: { in: NUMBERS } } });
  for (const id of ids) await prisma.rateLimit.deleteMany({ where: { key: { in: [`events:${id}`, `feedback:${id}`] } } });
}
if (process.argv.includes('--cleanup')) {
  await cleanup();
  console.log('cleanup done');
  process.exit(0);
}
await cleanup();

const mk = async (mobile: string, name: string) =>
  prisma.user.create({ data: { name, mobile, passwordHash: await hashAppPassword('Sup3r-secret!') } });
const alice = await mk(NUMBERS[0], 'FlowTest Alice');
const bob = await mk(NUMBERS[1], 'FlowTest Bob');
const tokenA = createAppToken(alice.id, alice.tokenVersion);
const tokenB = createAppToken(bob.id, bob.tokenVersion);

async function post(token: string | null, body: unknown, raw = false) {
  const res = await fetch(`${BASE}/api/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-App-Version': '1.0.9-test' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body: json };
}

let failures = 0;
let n = 0;
function check(label: string, ok: boolean, detail = '') {
  n += 1;
  if (!ok) failures += 1;
  console.log(`${String(n).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

const nowIso = () => new Date().toISOString();
const print = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'print', eventId: PREFIX + id, jobId: `job-${id}`, occurredAt: nowIso(), printerName: 'FlowTest Tejas_1A2B',
  source: 'manual_size', widthMm: 50, heightMm: 30, labels: 6, jobs: 1, ...extra,
});
const batch = (events: unknown[], sentAt = nowIso()) => ({ sentAt, events });
const userNow = async (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

console.log(`Checking ${BASE}/api/v1/events\n`);

check('no token -> 401', (await post(null, batch([print('x')]))).status === 401);

// 3 labels x 2 copies = 6 labels, 1 job
const first = await post(tokenA, batch([print('p1')]));
check('print job accepted', first.status === 200 && first.body.results[0].status === 'accepted', JSON.stringify(first.body.results?.[0]));
let a = await userNow(alice.id);
check('user counter went up by exactly 6 labels, last print set', a.printCountTotal === 6 && !!a.lastPrintAt, `count ${a.printCountTotal}`);

const again = await post(tokenA, batch([print('p1')]));
a = await userNow(alice.id);
check('retrying the same batch is a duplicate and counts nothing', again.body.results[0].status === 'duplicate' && a.printCountTotal === 6);

const parallel = await Promise.all(Array.from({ length: 6 }, () => post(tokenA, batch([print('p2', { labels: 4 })]))));
a = await userNow(alice.id);
const accepted = parallel.filter((r) => r.body.results?.[0]?.status === 'accepted').length;
check('same event sent 6 times at once is stored exactly once', accepted === 1 && a.printCountTotal === 10, `accepted ${accepted}, count ${a.printCountTotal}`);

const noPrinter = await post(tokenA, batch([print('p3', { printerName: '' })]));
check('print without a printer -> 400 PRINTER_REQUIRED, nothing stored',
  noPrinter.status === 400 && noPrinter.body.code === 'PRINTER_REQUIRED' && (await prisma.printEvent.count({ where: { eventId: PREFIX + 'p3' } })) === 0);

const bad = await post(tokenA, batch([
  print('b1', { labels: 0 }), print('b2', { widthMm: 3 }), print('b3', { source: 'weird' }), { type: 'nope', eventId: PREFIX + 'b4', occurredAt: nowIso() },
  { type: 'print', occurredAt: nowIso() }, print('b5', { labels: 20000 }), print('b6', { occurredAt: 'yesterday' }),
]));
const reasons = bad.body.results.map((r: any) => r.reason);
check('bad values are rejected with a reason each', JSON.stringify(reasons) === JSON.stringify(['BAD_LABEL_COUNT', 'BAD_SIZE', 'BAD_SOURCE', 'UNKNOWN_TYPE', 'MISSING_EVENT_ID', 'BAD_LABEL_COUNT', 'BAD_TIME']), reasons.join(','));
a = await userNow(alice.id);
check('rejected events changed no counter', a.printCountTotal === 10);

const future = await post(tokenA, batch([print('t1', { occurredAt: new Date(Date.now() + 3600_000).toISOString() })]));
const old = await post(tokenA, batch([print('t2', { occurredAt: new Date(Date.now() - 31 * 86400_000).toISOString() })]));
check('future-dated and 31-day-old events are rejected', future.body.results[0].reason === 'FUTURE' && old.body.results[0].reason === 'TOO_OLD');

// phone clock 2 hours slow: it says it is 2h earlier than the server and stamps the print 1 min before its own now
const slowNow = Date.now() - 2 * 3600_000;
const skewed = await post(tokenA, batch([print('t3', { occurredAt: new Date(slowNow - 60_000).toISOString(), labels: 1 })], new Date(slowNow).toISOString()));
const stored = await prisma.printEvent.findUnique({ where: { eventId: PREFIX + 't3' } });
const off = stored ? Math.abs(stored.occurredAt.getTime() - (Date.now() - 60_000)) : Infinity;
check('a phone clock that is 2 h slow is corrected', skewed.body.results[0].status === 'accepted' && off < 15_000, `off by ${Math.round(off / 1000)}s`);

// label keys and printer registry
await post(tokenA, batch([
  print('k1', { widthMm: 50.04, heightMm: 30, labels: 1 }),
  print('k2', { source: 'template', templateId: 'jewel-01', templateName: 'Jewellery', labels: 1 }),
  print('k3', { printerName: 'FlowTest TD404-77AF', labels: 1, widthMm: 30, heightMm: 50 }),
]));
const keys = Object.fromEntries((await prisma.printEvent.findMany({ where: { eventId: { in: [PREFIX + 'k1', PREFIX + 'k2', PREFIX + 'k3'] } } })).map((e) => [e.eventId, e]));
check('label key: manual size rounded to 0.1 mm', keys[PREFIX + 'k1']?.labelKey === 'manual:50x30', keys[PREFIX + 'k1']?.labelKey);
check('label key: template keeps id and size, name snapshot saved', keys[PREFIX + 'k2']?.labelKey === 'template:jewel-01:50x30' && keys[PREFIX + 'k2']?.templateNameSnapshot === 'Jewellery');
check('rotated size is a different key (30x50)', keys[PREFIX + 'k3']?.labelKey === 'manual:30x50');
const pr = await prisma.printer.findMany({ where: { nameRaw: { startsWith: 'FlowTest' } }, orderBy: { nameRaw: 'asc' } });
check('printer registry keeps raw name, strips device suffix, guesses family',
  pr.length === 2 && pr[0].nameRaw === 'FlowTest TD404-77AF' && pr[0].modelNormalised === 'FlowTest TD404' && pr[0].sdkFamily === 'td404'
  && pr[1].modelNormalised === 'FlowTest Tejas' && pr[1].sdkFamily === 'tez', pr.map((p) => `${p.modelNormalised}/${p.sdkFamily}`).join(' '));

// connections
const c1 = await post(tokenA, batch([{ type: 'printer_connected', eventId: PREFIX + 'c1', occurredAt: nowIso(), printerName: 'FlowTest Tejas_1A2B', transport: 'bt_spp' }]));
const c2 = await post(tokenA, batch([{ type: 'printer_connected', eventId: PREFIX + 'c2', occurredAt: nowIso(), printerName: 'FlowTest Tejas_1A2B', transport: 'bt_spp' }]));
const c3 = await post(tokenA, batch([{ type: 'printer_connected', eventId: PREFIX + 'c3', occurredAt: nowIso(), printerName: 'FlowTest TD404-77AF', transport: 'ble' }]));
const c4 = await post(tokenA, batch([{ type: 'printer_connected', eventId: PREFIX + 'c4', occurredAt: nowIso(), printerName: 'FlowTest TD404-77AF', transport: 'carrier-pigeon' }]));
check('connection logged once; a reconnect within 10 min is ignored; another printer counts; bad transport rejected',
  c1.body.results[0].status === 'accepted' && c2.body.results[0].reason === 'RECENT_CONNECTION' && c3.body.results[0].status === 'accepted' && c4.body.results[0].reason === 'BAD_TRANSPORT');

// shop clicks
const clickEv = { type: 'product_click', eventId: PREFIX + 's1', occurredAt: nowIso(), productKey: 'labels-50x30-white', productName: 'Thermal labels 50x30', category: 'labels' };
const s1 = await post(tokenA, batch([clickEv]));
const s2 = await post(tokenA, batch([clickEv]));
check('shop click stored once (retry is a duplicate)', s1.body.results[0].status === 'accepted' && s2.body.results[0].status === 'duplicate' && (await prisma.productClick.count({ where: { eventId: PREFIX + 's1' } })) === 1);

// feedback
const fb = (i: number, extra: Record<string, unknown> = {}) => ({ type: 'feedback', eventId: PREFIX + 'f' + i, occurredAt: nowIso(), rating: 5, category: 'suggestion', ...extra });
const long = 'x'.repeat(1500) + '\u0007bell';
const f1 = await post(tokenB, batch([fb(1, { message: long })]));
const stored1 = await prisma.feedback.findUnique({ where: { eventId: PREFIX + 'f1' } });
check('feedback saved, message cut to 1000 chars with control characters removed', f1.body.results[0].status === 'accepted' && stored1?.message?.length === 1000 && !stored1.message.includes('\u0007'));
const fBad = await post(tokenB, batch([fb(90, { rating: 9 }), fb(91, { category: 'rant' })]));
check('rating outside 1-5 and unknown category are rejected', fBad.body.results[0].reason === 'BAD_RATING' && fBad.body.results[1].reason === 'BAD_CATEGORY');
const rate = await post(tokenB, batch([fb(2), fb(3), fb(4), fb(5), fb(6), fb(7)]));
check('at most 5 feedback per user per day', rate.body.results.filter((r: any) => r.status === 'accepted').length === 4 && rate.body.results.slice(-2).every((r: any) => r.reason === 'RATE_LIMITED'), rate.body.results.map((r: any) => r.status[0] + (r.reason ? ':' + r.reason : '')).join(' '));

// batch limits
const big = await post(tokenA, batch(Array.from({ length: 51 }, (_, i) => print('big' + i, { labels: 1 }))));
check('more than 50 events -> 413', big.status === 413);
check('empty batch -> 400, broken JSON -> 400', (await post(tokenA, batch([]))).status === 400 && (await post(tokenA, '{nope', true)).status === 400);

// someone else's event id
const steal = await post(tokenB, batch([print('p1')]));
check('another user reusing an event id is a duplicate and counts nothing', steal.body.results[0].status === 'duplicate' && (await userNow(bob.id)).printCountTotal === 0);

// integrity
const sum = await prisma.printEvent.aggregate({ where: { userId: alice.id }, _sum: { labelsCount: true } });
a = await userNow(alice.id);
check('counter equals the sum of stored events', a.printCountTotal === (sum._sum.labelsCount ?? 0), `${a.printCountTotal} vs ${sum._sum.labelsCount}`);

// blocked
await prisma.user.update({ where: { id: bob.id }, data: { status: 'blocked', blockMessage: 'test', tokenVersion: { increment: 1 } } });
const blocked = await post(tokenB, batch([print('z1')]));
check('events from a blocked user -> 403 USER_BLOCKED, nothing stored',
  blocked.status === 403 && blocked.body.code === 'USER_BLOCKED' && (await prisma.printEvent.count({ where: { eventId: PREFIX + 'z1' } })) === 0);

await cleanup();
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`} (${n} checks)`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
