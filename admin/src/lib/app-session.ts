import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.ADMIN_SESSION_SECRET || 'dev-admin-session-secret';
}

export function createAppToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${userId}.${exp}.${nonce}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyAppToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [userId, expStr, nonce, sig] = parts;
  const payload = `${userId}.${expStr}.${nonce}`;
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

export function bearerUserId(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return verifyAppToken(match?.[1] ?? null);
}
