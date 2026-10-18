import { cookies } from 'next/headers';
import { COOKIE } from '@/lib/constants';
import { fail, HttpError, json } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { publicAdmin } from '@/lib/present';
import { sessionCookie, signSession, verifySession } from '@/lib/session';
import { toRecord } from '@/lib/admin-db';
import { prisma } from '@/lib/prisma';
import { generateTotpSecret, totpUri, verifyTotp } from '@/lib/totp';
import type { AdminRecord } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_PASSWORD = 12;

async function setupAdmin(): Promise<AdminRecord> {
  const jar = await cookies();
  const session = await verifySession(jar.get(COOKIE)?.value);
  if (!session || session.scope !== 'setup') throw new HttpError(401, 'Sign in to continue.');
  const row = await prisma.adminAccount.findUnique({ where: { id: session.id } });
  if (!row || !row.active) throw new HttpError(401, 'Sign in to continue.');
  return toRecord(row);
}

/** Authenticator details for the first-login screen. */
export async function GET() {
  try {
    const admin = await setupAdmin();
    const secret = admin.pendingTotpSecret ?? generateTotpSecret();
    if (!admin.pendingTotpSecret) {
      await prisma.adminAccount.update({ where: { id: admin.id }, data: { pendingTotpSecret: secret } });
    }
    return json({
      email: admin.email,
      needsPassword: !!admin.mustChangePassword,
      secret,
      otpauthUri: totpUri(secret, admin.email),
    });
  } catch (error) {
    return fail(error);
  }
}

/** New password (when required) + first TOTP code; on success the full session starts. */
export async function POST(request: Request) {
  try {
    const admin = await setupAdmin();
    const body = (await request.json()) as { newPassword?: string; code?: string };
    const newPassword = body.newPassword ?? '';
    if (admin.mustChangePassword) {
      if (newPassword.length < MIN_PASSWORD) {
        throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for the new password.`);
      }
      if (verifyPassword(newPassword, admin.passwordHash)) {
        throw new HttpError(400, 'Pick a password different from the one you were given.');
      }
    }
    const pending = admin.pendingTotpSecret;
    if (!pending) throw new HttpError(400, 'Reload this page to get an authenticator code.');
    const matched = verifyTotp(pending, body.code ?? '');
    if (matched === null) throw new HttpError(400, 'That code is not right. Check your authenticator app.');

    const saved = await prisma.adminAccount.update({
      where: { id: admin.id },
      data: {
        ...(admin.mustChangePassword ? { passwordHash: hashPassword(newPassword) } : {}),
        mustChangePassword: false,
        totpSecret: pending,
        pendingTotpSecret: null,
        lastTotpStep: matched,
        lastLoginAt: new Date(),
      },
    });
    const done = publicAdmin(toRecord(saved));
    const jar = await cookies();
    const full = sessionCookie(await signSession(admin.id));
    jar.set(full.name, full.value, full.options);
    return json({ step: 'done', admin: done });
  } catch (error) {
    return fail(error);
  }
}
