import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

import { fail, HttpError, json } from '@/lib/http';
import { ownerAdmin } from '@/lib/guard';
import { sessionCookie, signSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const misses = new Map<string, { n: number; reset: number }>();

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The one admin signs in with ADMIN_FIXED_USERNAME / ADMIN_FIXED_PASSWORD from the environment. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; email?: string; password?: string };
    const username = (body.username ?? body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const now = Date.now();
    const row = misses.get('owner');
    if (row && row.reset > now && row.n >= 8) {
      throw new HttpError(429, 'Too many tries. Wait a few minutes and try again.');
    }
    const expectedUser = (process.env.ADMIN_FIXED_USERNAME ?? '').trim().toLowerCase();
    const expectedPassword = process.env.ADMIN_FIXED_PASSWORD ?? '';
    if (!expectedUser || !expectedPassword || !same(username, expectedUser) || !same(password, expectedPassword)) {
      const current = misses.get('owner');
      if (!current || current.reset < now) misses.set('owner', { n: 1, reset: now + 15 * 60 * 1000 });
      else current.n += 1;
      throw new HttpError(401, 'That username or password does not match.');
    }
    misses.delete('owner');
    const jar = await cookies();
    const full = sessionCookie(await signSession('owner'));
    jar.set(full.name, full.value, full.options);
    return json({ step: 'done', admin: ownerAdmin() });
  } catch (error) {
    return fail(error);
  }
}
