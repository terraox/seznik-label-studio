import { randomBytes } from 'crypto';

import { isEmail, nid } from './format';
import { hashPassword, verifyPassword } from './passwords';
import { normalizeRole } from './permissions';
import { checkSecrets } from './secrets';
import { prisma } from './prisma';
import { read, update } from './store';

/** Stops the server when a secret is missing, short, a placeholder, or reused. */
export function assertSecrets() {
  const problems = checkSecrets();
  if (problems.length === 0) return;
  console.error('\n[boot] Refusing to start. Fix these secrets in the environment:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('  Generate fresh ones with: npm run secrets:gen\n');
  process.exit(1);
}

/**
 * One-time move of the old store.json admin list into Postgres. Accounts that predate
 * per-record credential versions came from the built-in seed whose logins were published,
 * so they are imported switched off. store.json is then left with an empty admin list.
 */
async function importAdminsFromStore() {
  const old = await read((db) => [...db.admins]);
  if (old.length === 0) return;
  for (const admin of old) {
    const email = admin.email.trim().toLowerCase();
    if (await prisma.adminAccount.findFirst({ where: { OR: [{ id: admin.id }, { email }] } })) continue;
    await prisma.adminAccount.create({
      data: {
        id: admin.id,
        name: admin.name,
        email,
        role: normalizeRole(admin.role),
        active: admin.active && !!admin.credsVersion,
        passwordHash: admin.passwordHash,
        mustChangePassword: !!admin.mustChangePassword,
        fixedCredentials: !!admin.fixedCredentials,
        credsVersion: admin.credsVersion ?? 0,
        totpSecret: admin.totpSecret ?? null,
        pendingTotpSecret: admin.pendingTotpSecret ?? null,
        lastTotpStep: admin.lastTotpStep ?? null,
        createdAt: new Date(admin.createdAt),
      },
    });
  }
  await update((db) => {
    db.admins = [];
  });
  console.log(`[boot] Moved ${old.length} admin account(s) from store.json to Postgres.`);
}

/**
 * Optional fixed owner login taken from the environment (the env file is the source of truth:
 * the password is re-applied on every start). No forced password change; the authenticator
 * (TOTP) is still enrolled at first sign-in and asked for on every sign-in.
 */
async function syncFixedAdmin() {
  const username = (process.env.ADMIN_FIXED_USERNAME ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_FIXED_PASSWORD ?? '';
  if (!username || !password) return false;
  if (password.length < 8) {
    console.error('[boot] ADMIN_FIXED_PASSWORD must be at least 8 characters; fixed login not applied.');
    return false;
  }
  const existing = await prisma.adminAccount.findUnique({ where: { email: username } });
  if (!existing) {
    await prisma.adminAccount.create({
      data: {
        id: nid('adm'),
        name: 'Owner',
        email: username,
        role: 'superadmin',
        passwordHash: hashPassword(password),
        fixedCredentials: true,
      },
    });
  } else {
    await prisma.adminAccount.update({
      where: { id: existing.id },
      data: {
        role: 'superadmin',
        active: true,
        credsVersion: 1,
        fixedCredentials: true,
        mustChangePassword: false,
        ...(verifyPassword(password, existing.passwordHash) ? {} : { passwordHash: hashPassword(password) }),
      },
    });
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('[boot] Production is using a fixed admin password from the environment. Make it strong and unique.');
  }
  return true;
}

export async function ensureAdmins() {
  await importAdminsFromStore();
  // Roles saved under the old names (owner / editor) become superadmin / support.
  for (const row of await prisma.adminAccount.findMany({ select: { id: true, role: true } })) {
    const role = normalizeRole(row.role);
    if (role !== row.role) await prisma.adminAccount.update({ where: { id: row.id }, data: { role } });
  }
  const fixed = await syncFixedAdmin();

  const switchedOff = await prisma.adminAccount.updateMany({
    where: { credsVersion: 0, active: true },
    data: { active: false },
  });
  if (switchedOff.count) console.warn(`[boot] Switched off ${switchedOff.count} admin(s) with pre-rotation credentials.`);

  if (fixed || (await prisma.adminAccount.count({ where: { role: 'superadmin', active: true } })) > 0) return;
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!isEmail(email)) {
    console.warn('[boot] No active super admin. Set BOOTSTRAP_ADMIN_EMAIL (or ADMIN_FIXED_USERNAME) and restart.');
    return;
  }
  const password = randomBytes(15).toString('base64url');
  const fields = {
    role: 'superadmin',
    active: true,
    passwordHash: hashPassword(password),
    mustChangePassword: true,
    credsVersion: 1,
    totpSecret: null,
    pendingTotpSecret: null,
    lastTotpStep: null,
  };
  const existing = await prisma.adminAccount.findUnique({ where: { email } });
  if (existing) await prisma.adminAccount.update({ where: { id: existing.id }, data: fields });
  else await prisma.adminAccount.create({ data: { id: nid('adm'), name: 'Owner', email, ...fields } });

  console.log('\n[boot] ============================================================');
  console.log('[boot] First super admin created. This password is shown ONCE:');
  console.log(`[boot]   sign-in : ${email}`);
  console.log(`[boot]   password: ${password}`);
  console.log('[boot] You must set a new password and enrol an authenticator app at first sign-in.');
  console.log('[boot] ============================================================\n');
}
