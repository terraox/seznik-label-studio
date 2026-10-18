import { createHmac, timingSafeEqual } from 'crypto';

import { getSecret } from './secrets';

const TTL_MS = 15 * 60 * 1000;

export type OtpPurpose = 'register' | 'login';

export function parsePurpose(value: unknown): OtpPurpose {
  return value === 'login' ? 'login' : 'register';
}

function secret() {
  return getSecret('OTP_HASH_SECRET');
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(`otp:${payload}`).digest('hex');
}

/** Proof that `mobile` passed OTP verification for one purpose (register or login). */
export function createOtpProof(mobile: string, purpose: OtpPurpose): string {
  const payload = `${purpose}.${mobile}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOtpProof(
  proof: string | undefined | null,
  mobile: string,
  purpose: OtpPurpose,
): boolean {
  if (!proof) return false;
  const parts = proof.split('.');
  if (parts.length !== 4) return false;
  const [p, m, expStr, sig] = parts;
  if (p !== purpose || m !== mobile || !(Date.now() <= Number(expStr))) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${p}.${m}.${expStr}`));
  return a.length === b.length && timingSafeEqual(a, b);
}
