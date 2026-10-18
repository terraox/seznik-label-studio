import { cookies } from 'next/headers';
import { fail, HttpError, json } from '@/lib/http';
import { verifyPassword } from '@/lib/passwords';
import { publicAdmin } from '@/lib/present';
import { sessionCookie, signSession } from '@/lib/session';
import { toRecord } from '@/lib/admin-db';
import { prisma } from '@/lib/prisma';
import { verifyTotp } from '@/lib/totp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const misses = new Map<string, { n: number; reset: number }>();

function miss(username: string, now: number) {
  const current = misses.get(username);
  if (!current || current.reset < now) misses.set(username, { n: 1, reset: now + 15 * 60 * 1000 });
  else current.n += 1;
}

/**
 * Step 1 (password) answers `setup` when the admin must set a new password / enrol TOTP,
 * or `totp` when a code is needed. Step 2 repeats the call with `code`.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      username?: string;
      password?: string;
      code?: string;
    };
    const username = (body.username ?? body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const now = Date.now();
    const row = misses.get(username);
    if (row && row.reset > now && row.n >= 8) {
      throw new HttpError(429, 'Too many tries. Wait a few minutes and try again.');
    }
    const account = await prisma.adminAccount.findFirst({ where: { email: username, active: true } });
    const admin = account ? toRecord(account) : null;
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      miss(username, now);
      throw new HttpError(401, 'That username or password does not match.');
    }

    const jar = await cookies();
    if (admin.mustChangePassword || !admin.totpSecret) {
      const setup = sessionCookie(await signSession(admin.id, 'setup'), 'setup');
      jar.set(setup.name, setup.value, setup.options);
      return json({ step: 'setup' });
    }

    if (!body.code) return json({ step: 'totp' });
    const matched = verifyTotp(admin.totpSecret, body.code, admin.lastTotpStep ?? 0);
    if (matched === null) {
      miss(username, now);
      throw new HttpError(401, 'That code is not right or was already used.');
    }
    await prisma.adminAccount.update({
      where: { id: admin.id },
      data: { lastTotpStep: matched, lastLoginAt: new Date() },
    });
    misses.delete(username);
    const full = sessionCookie(await signSession(admin.id));
    jar.set(full.name, full.value, full.options);
    return json({ step: 'done', admin: publicAdmin(admin) });
  } catch (error) {
    return fail(error);
  }
}
