import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

import { getSecret } from './secrets';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  return getSecret('APP_TOKEN_SECRET');
}

/** `userId.exp.nonce.tokenVersion.sig`. Older tokens (no tokenVersion) have 4 parts. */
export function createAppToken(userId: string, tokenVersion: number): string {
  const exp = Date.now() + TTL_MS;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${userId}.${exp}.${nonce}.${tokenVersion}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export type AppTokenClaims = { userId: string; tokenVersion: number | null };

export function verifyAppToken(token: string | undefined | null): AppTokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4 && parts.length !== 5) return null;
  const sig = parts[parts.length - 1];
  const payload = parts.slice(0, -1).join('.');
  const [userId, expStr] = parts;
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
  if (parts.length === 4) return { userId, tokenVersion: null };
  const tokenVersion = Number(parts[3]);
  return Number.isInteger(tokenVersion) ? { userId, tokenVersion } : null;
}

export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}
