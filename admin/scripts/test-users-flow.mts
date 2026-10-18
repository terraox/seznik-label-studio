// End-to-end check of accounts, duplicate numbers, block / unblock, OTP-in-Postgres and roles.
// Needs the admin server running on BASE (default http://localhost:3000) and the local database.
//
//   --prep      add four throw-away admins (known TOTP) to the database.
//   (default)   run the checks. Never sends an SMS.
//   --cleanup   remove the throw-away admins, users, numbers, OTP rows and counters it created.
import { createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../src/lib/passwords.ts';
import { createOtpProof } from '../src/lib/otp-proof.ts';
import { generateTotpSecret, totpNow } from '../src/lib/totp.ts';

process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
const BASE = process.env.BASE ?? 'http://localhost:3000';
const prisma = new PrismaClient();

const OWNER = { id: 'adm_flowtest_owner', email: 'flow-owner@sez.local', password: 'Flow-Test-Owner-123!', role: 'owner' }; // old name on purpose: boot maps it to superadmin
const VIEWER = { id: 'adm_flowtest_viewer', email: 'flow-viewer@sez.local', password: 'Flow-Test-Viewer-123!', role: 'viewer' };
const SUPPORT = { id: 'adm_flowtest_support', email: 'flow-support@sez.local', password: 'Flow-Test-Support-123!', role: 'editor' }; // old name: becomes support
const CONTENT = { id: 'adm_flowtest_content', email: 'flow-content@sez.local', password: 'Flow-Test-Content-123!', role: 'content' };
const NUMBERS = ['9000000011', '9000000012', '9000000013', '9000000014', '9000000015'];
const PW = 'Sup3r-secret!';

const ADMINS = [OWNER, VIEWER, SUPPORT, CONTENT];

if (process.argv.includes('--prep')) {
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { startsWith: 'adm_flowtest' } } });
  await prisma.adminAccount.deleteMany({ where: { id: { startsWith: 'adm_flowtest' } } });
  for (const a of ADMINS) {
    await prisma.adminAccount.create({
      data: { id: a.id, name: a.email, email: a.email, role: a.role, passwordHash: hashPassword(a.password), totpSecret: generateTotpSecret() },
    });
  }
  console.log('prep: added throw-away admins (roles saved under old names on purpose where noted)');
  process.exit(0);
}

if (process.argv.includes('--cleanup')) {
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { startsWith: 'adm_flowtest' } } });
  await prisma.adminAccount.deleteMany({ where: { id: { startsWith: 'adm_flowtest' } } });
  await prisma.user.deleteMany({ where: { mobile: { in: NUMBERS } } });
  await prisma.registeredPhone.deleteMany({ where: { mobile: { in: NUMBERS } } });
  await prisma.otpCode.deleteMany({ where: { mobile: { in: NUMBERS } } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'login:90000000' } } });
  console.log('cleanup: removed throw-away admins, users, numbers, OTP rows, counters and audit rows');
  process.exit(0);
}

// ───────── helpers ─────────
type Res = { status: number; body: any };
async function call(method: string, url: string, opts: { body?: unknown; cookie?: string; token?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const res = await fetch(BASE + url, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* csv or html */ }
  const set = res.headers.get('set-cookie');
  if (set) (body as any).__cookie = set.split(';')[0];
  return { status: res.status, body };
}

let failures = 0;
let n = 0;
function check(label: string, ok: boolean, detail = '') {
  n += 1;
  if (!ok) failures += 1;
  console.log(`${String(n).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
}

async function adminLogin(a: typeof OWNER, secret: string) {
  const first = await call('POST', '/api/auth/login', { body: { username: a.email, password: a.password } });
  if (first.body.step !== 'totp') throw new Error(`expected totp step, got ${JSON.stringify(first.body)}`);
  let code = totpNow(secret);
  const second = await call('POST', '/api/auth/login', { body: { username: a.email, password: a.password, code } });
  if (second.status !== 200) {
    // same 30 s step already used by a previous login: use the next step
    code = totpNow(secret, Date.now() + 30000);
    const retry = await call('POST', '/api/auth/login', { body: { username: a.email, password: a.password, code } });
    if (retry.status !== 200) throw new Error(`admin login failed ${retry.status}`);
    return retry.body.__cookie as string;
  }
  return second.body.__cookie as string;
}

function legacyToken(userId: string) {
  const exp = Date.now() + 3600_000;
  const payload = `${userId}.${exp}.${randomBytes(4).toString('hex')}`;
  return `${payload}.${createHmac('sha256', process.env.APP_TOKEN_SECRET!).update(payload).digest('hex')}`;
}

const proof = (mobile: string, purpose: 'register' | 'login' = 'register') => createOtpProof(mobile, purpose);
const register = (mobile: string, name = 'FlowTest User') => call('POST', '/api/app/register', { body: { name, mobile, password: PW, otpProof: proof(mobile) } });

// ───────── run ─────────
console.log(`Checking ${BASE}\n`);
const secretOf = async (id: string) => (await prisma.adminAccount.findUnique({ where: { id } }))?.totpSecret ?? '';
const [ownerSecret, viewerSecret, supportSecret, contentSecret] = await Promise.all(ADMINS.map((a) => secretOf(a.id)));
if (!ownerSecret) throw new Error('Run with --prep first.');

const [A, B, C, D] = NUMBERS;
const health = await call('GET', '/api/health');
check('health endpoint reaches the database', health.status === 200 && health.body.db === true);

const ownerCookie = await adminLogin(OWNER, ownerSecret);
const viewerCookie = await adminLogin(VIEWER, viewerSecret);
const supportCookie = await adminLogin(SUPPORT, supportSecret);
const contentCookie = await adminLogin(CONTENT, contentSecret);
check('all four admins sign in with password + authenticator code', !!ownerCookie && !!viewerCookie && !!supportCookie && !!contentCookie);
const meOwner = await call('GET', '/api/auth/me', { cookie: ownerCookie });
const meSupport = await call('GET', '/api/auth/me', { cookie: supportCookie });
check('old role names are migrated (owner -> superadmin, editor -> support)', meOwner.body.role === 'superadmin' && meSupport.body.role === 'support', `${meOwner.body.role}/${meSupport.body.role}`);

// register + duplicate numbers
const reg = await register(A);
check('register a new user', reg.status === 201 && !!reg.body.token, `status ${reg.status}`);
const userA = reg.body.user;
const tokenA1 = reg.body.token as string;
const dup1 = await register(A);
check('same number again is refused', dup1.status === 409 && dup1.body.code === 'PHONE_TAKEN', `status ${dup1.status}`);
const spellings = await Promise.all(['+91 90000 00011', '09000000011', '919000000011', '90000-00011'].map((m) =>
  call('POST', '/api/app/register', { body: { name: 'Again', mobile: m, password: PW, otpProof: proof(A) } })));
check('same number written +91 / 0 / 91 / dashes is refused too', spellings.every((r) => r.status === 409), spellings.map((r) => r.status).join(','));
check('only one account and one claim exist for the number',
  (await prisma.user.count({ where: { mobile: A } })) === 1 && (await prisma.registeredPhone.count({ where: { mobile: A } })) === 1);

// login
const login1 = await call('POST', '/api/app/login', { body: { mobile: A, password: PW } });
check('login with the right password', login1.status === 200 && !!login1.body.token);
const loginBad = await call('POST', '/api/app/login', { body: { mobile: A, password: 'wrong-password' } });
check('login with a wrong password is refused', loginBad.status === 401);
const me1 = await call('GET', '/api/app/me', { token: login1.body.token });
check('/me works with the token', me1.status === 200 && me1.body.user.id === userA.id);

// OTP in Postgres (no SMS sent)
const { issueOtp } = await import('../src/lib/otp-store.ts');
const code = await issueOtp(C, 'register');
const rows = await prisma.otpCode.findMany({ where: { mobile: C } });
check('OTP is stored hashed in Postgres', rows.length === 1 && rows[0].codeHash !== code && rows[0].codeHash.length === 64);
const wrong = await call('POST', '/api/app/otp/verify', { body: { mobile: C, otp: code === '000000' ? '111111' : '000000', purpose: 'register' } });
const right = await call('POST', '/api/app/otp/verify', { body: { mobile: C, otp: code, purpose: 'register' } });
check('wrong OTP rejected, right OTP accepted and gives a proof', wrong.status === 400 && right.status === 200 && !!right.body.otpProof);
const reuse = await call('POST', '/api/app/otp/verify', { body: { mobile: C, otp: code, purpose: 'register' } });
check('an OTP cannot be used twice', reuse.status === 400);

// admin sees the user
const list = await call('GET', `/api/users?q=${A}`, { cookie: supportCookie });
check('admin search by number finds the user (support)', list.status === 200 && list.body.users.some((u: any) => u.id === userA.id) && list.body.stats.users >= 1);
check('user list never contains password data', !JSON.stringify(list.body).toLowerCase().includes('passwordhash'));

// roles
const contentUsers = await call('GET', '/api/users', { cookie: contentCookie });
const contentTemplates = await call('GET', '/api/templates', { cookie: contentCookie });
check('content role: no access to users or phone numbers, can open the library', contentUsers.status === 403 && contentTemplates.status === 200, `${contentUsers.status}/${contentTemplates.status}`);
const viewerList = await call('GET', `/api/users?q=${A}`, { cookie: viewerCookie });
const viewerAll = await call('GET', '/api/users', { cookie: viewerCookie });
const viewerPhones = await call('GET', '/api/phones', { cookie: viewerCookie });
check('viewer: phone numbers masked, cannot search by number, no blocked-numbers list', viewerList.status === 200 && viewerList.body.users.length === 0 && viewerAll.body.users.every((u: any) => u.mobile.includes('•')) && viewerPhones.status === 403);
const supportList = await call('GET', `/api/users?q=${A}`, { cookie: supportCookie });
check('support: sees full phone numbers', supportList.body.users.some((u: any) => u.mobile === A));
const supportExport = await call('GET', '/api/users/export', { cookie: supportCookie });
const supportAudit = await call('GET', '/api/audit', { cookie: supportCookie });
check('support: cannot export users or read the audit log', supportExport.status === 403 && supportAudit.status === 403);
const supportAdmins = await call('POST', '/api/admins', { cookie: supportCookie, body: { name: 'x', email: 'x@y.co', password: 'abcdefghijkl1', role: 'viewer' } });
check('support: cannot create admins', supportAdmins.status === 403);
const viewerBlock = await call('POST', `/api/users/${userA.id}/block`, { cookie: viewerCookie, body: {} });
check('viewer cannot block', viewerBlock.status === 403, `status ${viewerBlock.status}`);
const viewerExport = await call('GET', '/api/users/export', { cookie: viewerCookie });
check('viewer cannot export', viewerExport.status === 403);
const noSession = await call('GET', '/api/users');
check('no session -> 401', noSession.status === 401);

// block
const blocked = await call('POST', `/api/users/${userA.id}/block`, { cookie: ownerCookie, body: { message: 'Misuse of the app', internalNote: 'reported by support' } });
check('owner blocks the user', blocked.status === 200 && blocked.body.user.status === 'blocked');
const meBlocked = await call('GET', '/api/app/me', { token: login1.body.token });
check('blocked user\'s existing token -> 403 USER_BLOCKED with the message', meBlocked.status === 403 && meBlocked.body.code === 'USER_BLOCKED' && meBlocked.body.message === 'Misuse of the app', `status ${meBlocked.status}`);
check('older builds get the text in `error`', String(meBlocked.body.error).includes('Misuse of the app') && String(meBlocked.body.error).includes('contact the admin'));
const loginBlocked = await call('POST', '/api/app/login', { body: { mobile: A, password: PW } });
check('blocked user cannot log in (403 with message)', loginBlocked.status === 403 && loginBlocked.body.code === 'USER_BLOCKED');
const loginBlockedBad = await call('POST', '/api/app/login', { body: { mobile: A, password: 'not-the-password' } });
check('wrong password on a blocked account is just 401 (no leak)', loginBlockedBad.status === 401);
const otpBlocked = await call('POST', '/api/app/otp/send', { body: { mobile: A, purpose: 'login' } });
check('OTP is not even sent to a blocked account', otpBlocked.status === 403);
const regBlocked = await register(A);
check('blocked number cannot register again', regBlocked.status === 403 || regBlocked.status === 409, `status ${regBlocked.status}`);
const again = await call('POST', `/api/users/${userA.id}/block`, { cookie: ownerCookie, body: {} });
check('blocking twice -> 409', again.status === 409);

// unblock
const unblocked = await call('POST', `/api/users/${userA.id}/unblock`, { cookie: ownerCookie, body: { note: 'resolved' } });
check('owner unblocks the user', unblocked.status === 200 && unblocked.body.user.status === 'active');
const oldTok = await call('GET', '/api/app/me', { token: login1.body.token });
check('old session stays signed out after unblock (401)', oldTok.status === 401, `status ${oldTok.status}`);
const login2 = await call('POST', '/api/app/login', { body: { mobile: A, password: PW } });
check('user logs in again after unblock', login2.status === 200 && (await call('GET', '/api/app/me', { token: login2.body.token })).status === 200);

// force logout
const out = await call('POST', `/api/users/${userA.id}/logout`, { cookie: ownerCookie, body: {} });
const afterOut = await call('GET', '/api/app/me', { token: login2.body.token });
check('"sign out everywhere" kills the session without blocking', out.status === 200 && afterOut.status === 401 && out.body.user.status === 'active');

// pre-blocked numbers
const pre = await call('POST', '/api/phones', { cookie: ownerCookie, body: { mobile: B, blocked: true, reason: 'Pre-blocked' } });
const regPre = await register(B);
const otpPre = await call('POST', '/api/app/otp/send', { body: { mobile: B, purpose: 'register' } });
check('a number blocked in advance cannot register or get an OTP', pre.status === 200 && regPre.status === 403 && otpPre.status === 403, `${regPre.status}/${otpPre.status}`);
await call('POST', '/api/phones', { cookie: ownerCookie, body: { mobile: B, blocked: false } });
const regB = await register(B, 'FlowTest B');
check('after lifting the block the number can register once', regB.status === 201);

// legacy tokens
const userB = regB.body.user;
const legacy = legacyToken(userB.id);
const legacyOk = await call('GET', '/api/app/me', { token: legacy });
await call('POST', `/api/users/${userB.id}/logout`, { cookie: ownerCookie, body: {} });
const legacyDead = await call('GET', '/api/app/me', { token: legacy });
check('pre-version tokens work while version is 0, and die after the first sign-out', legacyOk.status === 200 && legacyDead.status === 401, `${legacyOk.status}/${legacyDead.status}`);

// rate limit
let last = 0;
for (let i = 0; i < 11; i += 1) last = (await call('POST', '/api/app/login', { body: { mobile: D, password: `nope-${i}` } })).status;
check('login is rate-limited in Postgres after 10 tries (429)', last === 429, `last status ${last}`);

// audit + export + config
const auditRes = await call('GET', '/api/audit', { cookie: ownerCookie });
const actions = new Set((auditRes.body.entries ?? []).map((e: any) => e.action));
check('audit log recorded block, unblock, force logout, phone block', ['user.block', 'user.unblock', 'user.force_logout', 'phone.block', 'phone.unblock'].every((a) => actions.has(a)), [...actions].join(','));
const viewerAudit = await call('GET', '/api/audit', { cookie: viewerCookie });
check('viewer cannot read the audit log', viewerAudit.status === 403);
const exp = await call('GET', '/api/users/export', { cookie: ownerCookie });
check('owner can export users as CSV (no password column)', exp.status === 200 && typeof exp.body === 'string' && exp.body.includes('Mobile') && !exp.body.toLowerCase().includes('password'));
const cfg = await call('PUT', '/api/config', { cookie: ownerCookie, body: { adminContact: { email: 'help@example.com' } } });
const pub = await call('GET', '/api/app/config');
check('admin contact set by owner is served publicly to the app', cfg.status === 200 && pub.status === 200 && pub.body.adminContact.email === 'help@example.com');
await call('PUT', '/api/config', { cookie: ownerCookie, body: { adminContact: { email: null } } });

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`} (${n} checks)`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
