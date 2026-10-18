import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'seznik_admin_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.ADMIN_SESSION_SECRET || 'dev-admin-session-secret';
}

export function getAdminCredentials() {
  return {
    userId: process.env.ADMIN_USER_ID || 'SezAdmin',
    password: process.env.ADMIN_PASSWORD || 'SeznikAdmin310!',
  };
}

export function createSessionToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const payload = `${userId}.${expStr}`;
  const expected = createHmac('sha256', secret()).update(payload).digest('hex');
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return userId;
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE)?.value);
}

export function sessionCookieValue(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
    secure: process.env.NODE_ENV === 'production',
  };
}

export function clearSessionCookie() {
  return {
    name: COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
