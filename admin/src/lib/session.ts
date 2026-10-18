import { COOKIE, SESSION_MS } from './constants';
import { getSecret } from './secrets';

/** `setup` sessions may only finish first-login setup (new password + TOTP). */
export type Session = { id: string; exp: number; scope?: 'setup' };

export const SETUP_MS = 15 * 60 * 1000;

function secret() {
  return getSecret('SEZ_ADMIN_SECRET');
}

function b64urlEncode(bytes: Uint8Array) {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(value: string) {
  const pad = value + '='.repeat((4 - (value.length % 4)) % 4);
  const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(usage: 'sign' | 'verify') {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signSession(id: string, scope?: 'setup') {
  const payload: Session = scope
    ? { id, exp: Date.now() + SETUP_MS, scope }
    : { id, exp: Date.now() + SESSION_MS };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key('sign'), new TextEncoder().encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify(
      'HMAC',
      await key('verify'),
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Session;
    if (!payload || typeof payload.id !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, scope?: 'setup') {
  return {
    name: COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: (scope ? SETUP_MS : SESSION_MS) / 1000,
      secure: process.env.NODE_ENV === 'production',
    },
  };
}
