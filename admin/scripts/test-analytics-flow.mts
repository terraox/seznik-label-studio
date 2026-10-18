// End-to-end check of the admin analytics side: printer aliases, counter reconciliation, printers screen,
// print totals, most-printed labels, dashboard header, user detail, feedback and shop-click screens.
// Needs the admin server on BASE (default http://localhost:3000). Never sends an SMS.
// Seeds its own throw-away users, printers and events through the real intake API, compares the screens'
// numbers with hand-written SQL, and removes everything it made (also on --cleanup).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

import { hashAppPassword } from '../src/lib/app-passwords.ts';
import { createAppToken } from '../src/lib/app-session.ts';
import { hashPassword } from '../src/lib/passwords.ts';
import { generateTotpSecret, totpNow } from '../src/lib/totp.ts';

const ROOT = path.join(import.meta.dirname, '..');
process.loadEnvFile(path.join(ROOT, '.env'));
const BASE = process.env.BASE ?? 'http://localhost:3000';
const prisma = new PrismaClient();
const NUMBERS = ['9000000031', '9000000032', '9000000033'];
const P = 'fa-';
const ADMINS = [
  { id: 'adm_flowtest_a_super', email: 'flow-a-super@sez.local', role: 'superadmin', password: 'Flow-A-Super-123!' },
  { id: 'adm_flowtest_a_support', email: 'flow-a-support@sez.local', role: 'support', password: 'Flow-A-Support-123!' },
  { id: 'adm_flowtest_a_viewer', email: 'flow-a-viewer@sez.local', role: 'viewer', password: 'Flow-A-Viewer-123!' },
  { id: 'adm_flowtest_a_content', email: 'flow-a-content@sez.local', role: 'content', password: 'Flow-A-Content-123!' },
];

async function cleanup() {
  const users = await prisma.user.findMany({ where: { mobile: { in: NUMBERS } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.printEvent.deleteMany({ where: { OR: [{ eventId: { startsWith: P } }, { userId: { in: ids } }] } });
  await prisma.printerConnection.deleteMany({ where: { OR: [{ eventId: { startsWith: P } }, { userId: { in: ids } }] } });
  await prisma.productClick.deleteMany({ where: { eventId: { startsWith: P } } });
  await prisma.feedback.deleteMany({ where: { eventId: { startsWith: P } } });
  await prisma.printer.deleteMany({ where: { nameRaw: { startsWith: 'FlowA' } } });
  await prisma.printerAlias.deleteMany({ where: { OR: [{ pattern: { startsWith: 'FlowA' } }, { modelNormalised: { startsWith: 'FlowA' } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.registeredPhone.deleteMany({ where: { mobile: { in: NUMBERS } } });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { startsWith: 'adm_flowtest_a_' } } });
  await prisma.adminAccount.deleteMany({ where: { id: { startsWith: 'adm_flowtest_a_' } } });
  for (const id of ids) await prisma.rateLimit.deleteMany({ where: { key: { in: [`events:${id}`, `feedback:${id}`] } } });
}
if (process.argv.includes('--cleanup')) {
  await cleanup();
  console.log('cleanup done');
  process.exit(0);
}
await cleanup();

// ───────── setup ─────────
const secrets: Record<string, string> = {};
for (const a of ADMINS) {
  secrets[a.id] = generateTotpSecret();
  await prisma.adminAccount.create({ data: { id: a.id, name: a.email, email: a.email, role: a.role, passwordHash: hashPassword(a.password), totpSecret: secrets[a.id] } });
}
const mkUser = async (mobile: string, name: string, extra: Record<string, unknown> = {}) =>
  prisma.user.create({ data: { name, mobile, passwordHash: await hashAppPassword('Sup3r-secret!'), ...extra } });
const alice = await mkUser(NUMBERS[0], 'FlowA Alice', { printerName: 'tejas' });
const bob = await mkUser(NUMBERS[1], 'FlowA Bob', { printerName: 'rudra' });
const qa = await mkUser(NUMBERS[2], 'FlowA QA', { printerName: 'josh', isInternal: true });
const tok = (u: { id: string; tokenVersion: number }) => createAppToken(u.id, u.tokenVersion);

type Res = { status: number; body: any };
async function call(method: string, url: string, opts: { body?: unknown; cookie?: string; token?: string } = {}): Promise<Res> {
  const res = await fetch(BASE + url, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* csv or html */ }
  const set = res.headers.get('set-cookie');
  if (set && typeof body === 'object') body.__cookie = set.split(';')[0];
  return { status: res.status, body };
}
let stepOffset = 0;
async function login(a: (typeof ADMINS)[number]) {
  const first = await call('POST', '/api/auth/login', { body: { username: a.email, password: a.password } });
  if (first.body.step !== 'totp') throw new Error('expected totp step');
  stepOffset += 0;
  const r = await call('POST', '/api/auth/login', { body: { username: a.email, password: a.password, code: totpNow(secrets[a.id]) } });
  if (r.status !== 200) throw new Error(`login failed ${r.status}`);
  return r.body.__cookie as string;
}
const [sup, supp, view, cont] = [await login(ADMINS[0]), await login(ADMINS[1]), await login(ADMINS[2]), await login(ADMINS[3])];

let failures = 0;
let n = 0;
function check(label: string, ok: boolean, detail = '') {
  n += 1;
  if (!ok) failures += 1;
  console.log(`${String(n).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;
let seq = 0;
const printEv = (user: { id: string; tokenVersion: number }, over: Record<string, unknown> = {}) => ({
  user,
  ev: { type: 'print', eventId: `${P}${(seq += 1)}`, jobId: `job-${seq}`, occurredAt: iso(1000), printerName: 'FlowA Tejas_1A2B', source: 'manual_size', widthMm: 50, heightMm: 30, labels: 6, ...over },
});
async function send(items: { user: { id: string; tokenVersion: number }; ev: Record<string, unknown> }[]) {
  const byUser = new Map<string, Record<string, unknown>[]>();
  for (const { user, ev } of items) byUser.set(user.id, [...(byUser.get(user.id) ?? []), ev]);
  for (const [id, events] of byUser) {
    const u = items.find((i) => i.user.id === id)!.user;
    for (let i = 0; i < events.length; i += 50) {
      const r = await call('POST', '/api/v1/events', { token: tok(u), body: { sentAt: new Date().toISOString(), events: events.slice(i, i + 50) } });
      if (r.status !== 200) throw new Error(`seed failed ${r.status} ${JSON.stringify(r.body)}`);
    }
  }
}

console.log(`Checking ${BASE}\n`);

// ───────── C2: printer aliases ─────────
await send([printEv(alice), printEv(bob, { printerName: 'FlowA Tejas_7777' }), printEv(alice, { printerName: 'FlowA Rudra_AAAA', labels: 1 })]);
const before = await prisma.printer.findMany({ where: { nameRaw: { startsWith: 'FlowA' } }, orderBy: { nameRaw: 'asc' } });
check('two Tejas devices share one automatic model name', before.filter((p) => p.modelNormalised === 'FlowA Tejas').length === 2, before.map((p) => p.modelNormalised).join(','));
const viewerAlias = await call('POST', '/api/printer-aliases', { cookie: view, body: { pattern: 'FlowA Tejas', model: 'FlowA Tejas Pro' } });
check('viewer cannot create alias rules', viewerAlias.status === 403);
const alias = await call('POST', '/api/printer-aliases', { cookie: supp, body: { pattern: 'FlowA Tejas', model: 'FlowA Tejas Pro' } });
const after = await prisma.printer.findMany({ where: { nameRaw: { startsWith: 'FlowA Tejas' } } });
check('support creates a rule: both existing printers are renamed', alias.status === 201 && alias.body.printersChanged === 2 && after.every((p) => p.modelNormalised === 'FlowA Tejas Pro'));
await send([printEv(bob, { printerName: 'FlowA Tejas_9999', labels: 1 })]);
const late = await prisma.printer.findUnique({ where: { nameRaw: 'FlowA Tejas_9999' } });
check('a printer that connects later gets the rule too', late?.modelNormalised === 'FlowA Tejas Pro');
check('same pattern twice -> 409', (await call('POST', '/api/printer-aliases', { cookie: sup, body: { pattern: 'flowa tejas', model: 'x' } })).status === 409);
const del = await call('DELETE', `/api/printer-aliases/${alias.body.alias.id}`, { cookie: sup });
const reverted = await prisma.printer.findMany({ where: { nameRaw: { startsWith: 'FlowA Tejas' } } });
check('deleting the rule puts printers back to the automatic name', del.status === 200 && reverted.every((p) => p.modelNormalised === 'FlowA Tejas'), `reverted ${del.body.printersReverted}`);

// ───────── C3: counter integrity ─────────
const run = (args: string[]) => {
  try {
    return { code: 0, out: execFileSync('npx', ['--yes', 'tsx', 'scripts/reconcile-counters.mts', ...args], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (err: any) {
    return { code: err.status as number, out: String(err.stdout) };
  }
};
const cleanRun = run([]);
check('reconcile script: counters match the events (exit 0)', cleanRun.code === 0 && cleanRun.out.includes('no drift'));
await prisma.user.update({ where: { id: alice.id }, data: { printCountTotal: { increment: 5 } } });
const driftRun = run([]);
check('reconcile script: reports a tampered counter and exits 1', driftRun.code === 1 && driftRun.out.includes('FlowA Alice') && driftRun.out.includes('DRIFT'));
const fixRun = run(['--fix']);
const aliceNow = await prisma.user.findUniqueOrThrow({ where: { id: alice.id } });
const aliceSum = await prisma.printEvent.aggregate({ where: { userId: alice.id }, _sum: { labelsCount: true } });
check('reconcile --fix rewrites the counter from the events', fixRun.code === 0 && aliceNow.printCountTotal === aliceSum._sum.labelsCount);

// start the screen checks from a clean slate (the C2/C3 checks above left their own events behind)
await prisma.printEvent.deleteMany({ where: { eventId: { startsWith: P } } });
await prisma.printerConnection.deleteMany({ where: { eventId: { startsWith: P } } });
await prisma.printer.deleteMany({ where: { nameRaw: { startsWith: 'FlowA' } } });
await prisma.user.updateMany({ where: { id: { in: [alice.id, bob.id, qa.id] } }, data: { printCountTotal: 0, lastPrintAt: null } });
for (const u of [alice, bob, qa]) await prisma.rateLimit.deleteMany({ where: { key: `events:${u.id}` } });
// ───────── shared dataset for the screens (D1-D7) ─────────
// Alice: tejas x2 devices, TD404; Bob: another Tejas + Rudra; QA (internal): Tejas.
const conns = [
  { user: alice, id: 'c1', printerName: 'FlowA Tejas_1A2B', ago: 3 * 3600_000 },
  { user: alice, id: 'c2', printerName: 'FlowA Tejas_1A2B', ago: 3600_000 },
  { user: alice, id: 'c3', printerName: 'FlowA TD404-77AF', ago: 2 * 3600_000 },
  { user: bob, id: 'c4', printerName: 'FlowA Tejas_7777', ago: 5 * 3600_000 },
  { user: bob, id: 'c5', printerName: 'FlowA Rudra_AAAA', ago: 4 * 3600_000 },
  { user: qa, id: 'c6', printerName: 'FlowA Tejas_1A2B', ago: 6 * 3600_000 },
];
await send(conns.map((c) => ({ user: c.user, ev: { type: 'printer_connected', eventId: P + c.id, occurredAt: iso(c.ago), printerName: c.printerName, transport: 'bt_spp' } })));
await send([
  printEv(alice, { occurredAt: iso(1 * DAY), labels: 6 }),
  printEv(alice, { occurredAt: iso(10 * DAY), labels: 4, jobs: 2 }),
  printEv(alice, { occurredAt: iso(2 * 3600_000), labels: 20, source: 'template', templateId: 'jewel-01', templateName: 'Jewellery Tag', printerName: 'FlowA TD404-77AF' }),
  printEv(alice, { occurredAt: iso(25 * DAY), labels: 3, widthMm: 30, heightMm: 50 }),
  printEv(bob, { occurredAt: iso(3 * DAY), labels: 10, printerName: 'FlowA Tejas_7777' }),
  printEv(bob, { occurredAt: iso(6 * DAY), labels: 5, source: 'template', templateId: 'jewel-01', templateName: 'Jewellery Tag', printerName: 'FlowA Rudra_AAAA' }),
  printEv(qa, { occurredAt: iso(3600_000), labels: 100 }),
]);
const mine = { in: [alice.id, bob.id, qa.id] };
const sqlOne = async <T,>(q: Promise<T[]>) => (await q)[0];

// ───────── D1: printers screen ─────────
const pr = await call('GET', '/api/printers?internal=hide', { cookie: sup });
const prAll = await call('GET', '/api/printers', { cookie: sup });
const modelRow = (d: any, m: string) => d.body.printers.find((p: any) => p.model === m);
const tejasHide = modelRow(pr, 'FlowA Tejas');
const [cAlice] = [await prisma.printerConnection.count({ where: { userId: alice.id, printer: { modelNormalised: 'FlowA Tejas' } } })];
check('printers (internal hidden): Tejas = 2 device names, 2 users, hand-counted connections and labels',
  tejasHide?.deviceNames === 2 && tejasHide?.users === 2 && tejasHide?.connections === cAlice + 1 && tejasHide?.labels === 6 + 4 + 3 + 10 && cAlice === 2,
  JSON.stringify(tejasHide));
const tejasAll = modelRow(prAll, 'FlowA Tejas');
check('printers (internal included): the test account adds its connection, its 100 labels and one user',
  tejasAll?.users === 3 && tejasAll?.connections === tejasHide.connections + 1 && tejasAll?.labels === tejasHide.labels + 100);
const flowOnly = (d: any) => d.body.printers.filter((p: any) => p.model.startsWith('FlowA'));
check('three FlowA models listed; headline counts present', flowOnly(pr).length === 3 && pr.body.uniqueModels >= 3 && pr.body.totalConnections >= 5 && pr.body.usersWithPrinter >= 2);
const fam = await call('GET', '/api/printers?family=td404&internal=hide', { cookie: sup });
check('SDK family filter works', fam.body.printers.every((p: any) => p.family === 'td404') && fam.body.printers.some((p: any) => p.model === 'FlowA TD404'));
const pu = await call('GET', '/api/printers/users?model=flowa%20tejas&internal=hide', { cookie: sup });
const puNames = pu.body.users.map((u: any) => u.name).sort();
check('users of one model: names, full numbers for support, per-user connections', JSON.stringify(puNames) === JSON.stringify(['FlowA Alice', 'FlowA Bob']) && pu.body.users.every((u: any) => /^\d{10}$/.test(u.mobile)) && pu.body.users.find((u: any) => u.name === 'FlowA Alice').connections === 2);
const puView = await call('GET', '/api/printers/users?model=flowa%20tejas', { cookie: view });
check('viewer sees the same list with masked numbers', puView.status === 200 && puView.body.users.every((u: any) => u.mobile.includes('•')));

// ───────── D2 / D3 / D4: totals, most printed labels, dashboard header ─────────
// Expected numbers are computed in JavaScript from the stored rows, independent of the SQL under test.
const IST = 5.5 * 3600_000;
const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const monthStartMs = (() => { const d = new Date(Date.now() + IST); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST; })();
const rows = await prisma.printEvent.findMany({ where: { userId: { in: [alice.id, bob.id, qa.id] } }, include: { printer: true } });
const sumOf = (list: typeof rows, f: (e: (typeof rows)[number]) => number) => list.reduce((t, e) => t + f(e), 0);
const publicRows = rows.filter((e) => e.userId !== qa.id);
const inLast7 = (e: (typeof rows)[number]) => e.occurredAt.getTime() >= Date.now() - 7 * DAY;
const inMonth = (e: (typeof rows)[number]) => e.occurredAt.getTime() >= monthStartMs;

const t = await call('GET', '/api/stats/prints?internal=hide', { cookie: sup });
check('totals (internal hidden): lifetime labels and jobs',
  t.body.lifetime.labels === sumOf(publicRows, (e) => e.labelsCount) && t.body.lifetime.jobs === sumOf(publicRows, (e) => e.jobs), JSON.stringify(t.body.lifetime));
check('totals: last 7 days is a rolling 7 x 24 h window',
  t.body.last7Days.labels === sumOf(publicRows.filter(inLast7), (e) => e.labelsCount) && t.body.last7Days.jobs === sumOf(publicRows.filter(inLast7), (e) => e.jobs), JSON.stringify(t.body.last7Days));
check('totals: this month starts at 00:00 on the 1st, India time',
  t.body.thisMonth.labels === sumOf(publicRows.filter(inMonth), (e) => e.labelsCount) && Math.abs(Date.parse(t.body.thisMonth.from) - monthStartMs) < 1000, `${t.body.thisMonth.labels} from ${t.body.thisMonth.from}`);
const tAll = await call('GET', '/api/stats/prints', { cookie: sup });
check('totals (internal included) add the test account\'s 100 labels', tAll.body.lifetime.labels === t.body.lifetime.labels + 100);
const expectDaily = new Map<string, number>();
for (const e of publicRows) expectDaily.set(istDay(e.occurredAt.getTime()), (expectDaily.get(istDay(e.occurredAt.getTime())) ?? 0) + e.labelsCount);
const gotDaily = new Map<string, number>(t.body.daily.map((d: any) => [d.day, d.labels] as [string, number]));
const dailyOk = t.body.daily.length === 30 && [...gotDaily].every(([day, v]) => v === (expectDaily.get(day) ?? 0)) && [...expectDaily.keys()].every((d) => gotDaily.has(d));
check('daily chart: 30 India-time days, zero-filled, each day equals the hand sum', dailyOk, `days ${t.body.daily.length}`);
const fam2 = await call('GET', '/api/stats/prints?internal=hide&family=td404', { cookie: sup });
check('SDK-family filter narrows the totals to that family', fam2.body.lifetime.labels === sumOf(publicRows.filter((e) => e.printer.sdkFamily === 'td404'), (e) => e.labelsCount) && fam2.body.lifetime.labels > 0);

const lab = await call('GET', '/api/stats/labels?internal=hide&window=all', { cookie: view });
const byKey = Object.fromEntries(lab.body.labels.map((l: any) => [l.labelKey, l]));
const expKey = (k: string) => publicRows.filter((e) => e.labelKey === k);
check('most printed: template row first, shown as "50 x 30 mm · Jewellery Tag" with labels, jobs, distinct users',
  lab.body.labels[0].labelKey === 'template:jewel-01:50x30' && lab.body.labels[0].display === '50 x 30 mm · Jewellery Tag'
  && byKey['template:jewel-01:50x30'].labelsPrinted === sumOf(expKey('template:jewel-01:50x30'), (e) => e.labelsCount)
  && byKey['template:jewel-01:50x30'].users === 2 && byKey['template:jewel-01:50x30'].jobs === 2, JSON.stringify(lab.body.labels[0]));
check('most printed: manual sizes show as "50 x 30 mm" and rotated 30x50 is its own row',
  byKey['manual:50x30'].display === '50 x 30 mm' && byKey['manual:50x30'].labelsPrinted === sumOf(expKey('manual:50x30'), (e) => e.labelsCount)
  && byKey['manual:30x50'].display === '30 x 50 mm' && byKey['manual:30x50'].labelsPrinted === 3);
const lab7 = await call('GET', '/api/stats/labels?internal=hide&window=7d', { cookie: sup });
const exp7 = (k: string) => sumOf(publicRows.filter(inLast7).filter((e) => e.labelKey === k), (e) => e.labelsCount);
check('most printed: 7-day window drops older prints',
  lab7.body.labels.find((l: any) => l.labelKey === 'manual:50x30').labelsPrinted === exp7('manual:50x30') && !lab7.body.labels.some((l: any) => l.labelKey === 'manual:30x50'));
const labLimit = await call('GET', '/api/stats/labels?internal=hide&limit=1', { cookie: sup });
check('most printed: limit is respected', labLimit.body.labels.length === 1);

const sm = await call('GET', '/api/stats/summary?internal=hide', { cookie: view });
const realUsers = await prisma.user.count({ where: { deletedAt: null, isInternal: false } });
const smAll = await call('GET', '/api/stats/summary', { cookie: view });
check('dashboard header: users, active/blocked, new in 7 days match the table',
  sm.body.users.total === realUsers && sm.body.users.blocked === 0 && sm.body.users.active === realUsers
  && sm.body.users.newLast7Days === (await prisma.user.count({ where: { deletedAt: null, isInternal: false, createdAt: { gte: new Date(Date.now() - 7 * DAY) } } }))
  && smAll.body.users.total === realUsers + 1, JSON.stringify(sm.body.users));
check('dashboard header: unique printer models (3 here), lifetime labels, no rating yet',
  sm.body.printerModels === 3 && sm.body.prints.lifetimeLabels === sumOf(publicRows, (e) => e.labelsCount) && sm.body.rating.average === null && sm.body.rating.count === 0);
const f = t.body.footer;
check('footers: tracking-since date, "labels sent to a connected printer" wording, app-version mix',
  !!f.trackingSince && f.countedAs.includes('Labels sent to a connected printer') && Array.isArray(f.appVersions) && f.appVersions.length > 0 && f.appVersions.reduce((a: number, v: any) => a + v.users, 0) === (await prisma.user.count({ where: { deletedAt: null } })));
check('viewer role may read these analytics (they contain no phone numbers)', (await call('GET', '/api/stats/summary', { cookie: view })).status === 200);

// ───────── D5: user detail ─────────
await send([{ user: alice, ev: { type: 'feedback', eventId: P + 'fb-a1', occurredAt: iso(5000), rating: 4, category: 'suggestion', message: 'Please add more fonts' } }]);
const ud = await call('GET', `/api/users/${alice.id}`, { cookie: supp });
const aliceRows = rows.filter((e) => e.userId === alice.id);
check('user detail: last-7-days labels equal the hand sum', ud.body.user.labelsLast7Days === sumOf(aliceRows.filter(inLast7), (e) => e.labelsCount), `${ud.body.user.labelsLast7Days}`);
const tejasU = ud.body.printers.find((p: any) => p.model === 'FlowA Tejas');
const tdU = ud.body.printers.find((p: any) => p.model === 'FlowA TD404');
check('user detail: printers used with connections and labels per model',
  tejasU?.connections === 2 && tejasU?.labels === 6 + 4 + 3 && tdU?.connections === 1 && tdU?.labels === 20 && ud.body.printers.length === 2, JSON.stringify(ud.body.printers.map((p: any) => [p.model, p.connections, p.labels])));
const recentSorted = ud.body.recentPrints.every((p: any, i: number, arr: any[]) => i === 0 || arr[i - 1].at >= p.at);
check('user detail: recent prints newest first, template shown with its name',
  ud.body.recentPrints.length === 4 && recentSorted && ud.body.recentPrints[0].label === '50 x 30 mm · Jewellery Tag' && ud.body.recentPrints[0].labels === 20);
check('user detail: feedback listed', ud.body.feedback.length === 1 && ud.body.feedback[0].rating === 4 && ud.body.feedback[0].message === 'Please add more fonts');
const ul = await call('GET', `/api/users?q=${NUMBERS[0]}`, { cookie: supp });
check('user list: 7-day labels column', ul.body.users[0].labelsLast7Days === sumOf(aliceRows.filter(inLast7), (e) => e.labelsCount));
const udView = await call('GET', `/api/users/${alice.id}`, { cookie: view });
check('viewer sees the detail with the number masked', udView.status === 200 && udView.body.user.mobile.includes('•'));

// ───────── D6: feedback ─────────
const fev = (user: any, id: string, rating: number, category: string, message?: string) =>
  ({ user, ev: { type: 'feedback', eventId: P + id, occurredAt: iso(1000), rating, category, ...(message ? { message } : {}) } });
await send([fev(bob, 'fb-b1', 5, 'bug', 'Crash on print screen'), fev(bob, 'fb-b2', 2, 'other'), fev(qa, 'fb-q1', 1, 'bug', 'internal test note')]);
const fbAll = await call('GET', '/api/feedback', { cookie: supp });
const fbHide = await call('GET', '/api/feedback?internal=hide', { cookie: supp });
// hand sums: alice 4, bob 5 and 2 are public; qa 1 internal
check('feedback summary: average, count and 1-5 distribution (internal hidden)',
  fbHide.body.summary.count === 3 && fbHide.body.summary.average === Math.round(((4 + 5 + 2) / 3) * 100) / 100
  && JSON.stringify(fbHide.body.summary.distribution.map((d: any) => d.count)) === JSON.stringify([0, 1, 0, 1, 1]), JSON.stringify(fbHide.body.summary));
check('feedback summary with internal included adds the 1-star', fbAll.body.summary.count === 4 && fbAll.body.summary.distribution[0].count === 1);
const byRating = await call('GET', '/api/feedback?rating=5&internal=hide', { cookie: supp });
const byCat = await call('GET', '/api/feedback?category=bug', { cookie: supp });
const byText = await call('GET', '/api/feedback?q=fonts', { cookie: supp });
const byName = await call('GET', '/api/feedback?q=flowa%20bob&internal=hide', { cookie: supp });
const byPhone = await call('GET', `/api/feedback?q=${NUMBERS[0]}`, { cookie: supp });
check('feedback filters: rating, category, text, sender name, sender number',
  byRating.body.items.length === 1 && byRating.body.items[0].message === 'Crash on print screen'
  && byCat.body.items.length === 2 && byText.body.items.length === 1 && byName.body.items.length === 2 && byPhone.body.items.length === 1);
const future = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
const byDate = await call('GET', `/api/feedback?from=${future}`, { cookie: supp });
const byDateOk = await call('GET', `/api/feedback?from=${new Date(Date.now() - DAY).toISOString().slice(0, 10)}&internal=hide`, { cookie: supp });
check('feedback date filter', byDate.body.items.length === 0 && byDateOk.body.items.length === 3);
const fbContent = await call('GET', '/api/feedback', { cookie: cont });
const fbView = await call('GET', '/api/feedback', { cookie: view });
check('content role sees feedback without who sent it; viewer sees the name with a masked number',
  fbContent.status === 200 && fbContent.body.items.every((i: any) => i.user === null) && fbView.body.items[0].user.mobile.includes('•'));
const target = fbHide.body.items.find((i: any) => i.message === 'Crash on print screen');
const patch = await call('PATCH', `/api/feedback/${target.id}`, { cookie: supp, body: { status: 'reviewed', adminNote: 'Reproduced, fix in next build' } });
const afterPatch = await call('GET', '/api/feedback?status=reviewed', { cookie: supp });
check('support sets status and note; the status filter finds it',
  patch.status === 200 && afterPatch.body.items.length === 1 && afterPatch.body.items[0].adminNote === 'Reproduced, fix in next build');
check('invalid status -> 400; viewer cannot edit', (await call('PATCH', `/api/feedback/${target.id}`, { cookie: supp, body: { status: 'done' } })).status === 400
  && (await call('PATCH', `/api/feedback/${target.id}`, { cookie: view, body: { status: 'resolved' } })).status === 403);
check('feedback change is in the audit log', (await prisma.adminAuditLog.count({ where: { action: 'feedback.update', targetId: target.id } })) === 1);

// ───────── D7: shop clicks ─────────
const click = (user: any, id: string, key: string, name: string, ago: number, category = 'labels') =>
  ({ user, ev: { type: 'product_click', eventId: P + id, occurredAt: iso(ago), productKey: key, productName: name, category } });
await send([
  click(alice, 'k1', 'fa-label-50x30', 'FlowA Label 50x30', 2 * 3600_000),
  click(alice, 'k2', 'fa-label-50x30', 'FlowA Label 50x30', 2 * DAY),
  click(bob, 'k3', 'fa-label-50x30', 'FlowA Label 50x30', 20 * DAY),
  click(bob, 'k4', 'fa-printer-tejas', 'FlowA Tejas printer', 3 * 3600_000, 'printers'),
  click(qa, 'k5', 'fa-printer-tejas', 'FlowA Tejas printer', 3600_000, 'printers'),
]);
const clickRows = await prisma.productClick.findMany({ where: { eventId: { startsWith: P } } });
const pubClicks = clickRows.filter((c) => c.userId !== qa.id);
const sh = await call('GET', '/api/stats/shop?internal=hide&product=fa-label-50x30', { cookie: supp });
const lbl = sh.body.products.find((p: any) => p.key === 'fa-label-50x30');
const expLbl = pubClicks.filter((c) => c.productKey === 'fa-label-50x30');
check('shop clicks: total, distinct people, 7-day and month counts match the hand count',
  lbl.clicks === expLbl.length && lbl.users === new Set(expLbl.map((c) => c.userId)).size
  && lbl.last7Days === expLbl.filter((c) => c.occurredAt.getTime() >= Date.now() - 7 * DAY).length
  && lbl.thisMonth === expLbl.filter((c) => c.occurredAt.getTime() >= monthStartMs).length, JSON.stringify(lbl));
const order = sh.body.products.filter((p: any) => p.key.startsWith('fa-')).map((p: any) => p.key);
check('shop clicks: sorted by clicks, internal account left out of the printer row',
  order[0] === 'fa-label-50x30' && sh.body.products.find((p: any) => p.key === 'fa-printer-tejas').clicks === 1);
const shAll = await call('GET', '/api/stats/shop', { cookie: supp });
check('shop clicks: including internal accounts adds their tap', shAll.body.products.find((p: any) => p.key === 'fa-printer-tejas').clicks === 2);
const trendMap = new Map<string, number>();
for (const c of expLbl) trendMap.set(istDay(c.occurredAt.getTime()), (trendMap.get(istDay(c.occurredAt.getTime())) ?? 0) + 1);
check('shop clicks: 30-day daily trend equals the hand count per India-time day',
  sh.body.trend.length === 30 && sh.body.trend.every((d: any) => d.clicks === (trendMap.get(d.day) ?? 0)));
check('shop clicks: viewer allowed, no session refused', (await call('GET', '/api/stats/shop', { cookie: view })).status === 200 && (await call('GET', '/api/stats/shop')).status === 401);

// ──SECTIONS-BELOW──

await cleanup();
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`} (${n} checks)`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
