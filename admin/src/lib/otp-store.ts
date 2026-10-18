import { createHmac, randomInt, timingSafeEqual } from 'crypto';

import { OTP_EXPIRY_MINUTES, OTP_LENGTH } from '@/lib/msg91';

/** In-memory, like otp-throttle: resets on restart and is not shared across instances. */
const MAX_ATTEMPTS = 5;
type Entry = { hash: string; expiresAt: number; attempts: number };
// Kept on globalThis so the send and verify routes (separate bundles) share one store.
const g = globalThis as unknown as { __otpEntries?: Map<string, Entry> };
const entries = (g.__otpEntries ??= new Map<string, Entry>());

function hash(mobile: string, otp: string) {
  const secret = process.env.ADMIN_SESSION_SECRET || 'dev-admin-session-secret';
  return createHmac('sha256', secret).update(`${mobile}:${otp}`).digest('hex');
}

export function issueOtp(mobile: string): string {
  const otp = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
  entries.set(mobile, {
    hash: hash(mobile, otp),
    expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
    attempts: 0,
  });
  return otp;
}

export function discardOtp(mobile: string) {
  entries.delete(mobile);
}

export function checkOtp(
  mobile: string,
  otp: string,
): 'ok' | 'wrong' | 'expired' | 'blocked' {
  const e = entries.get(mobile);
  if (!e || Date.now() > e.expiresAt) {
    entries.delete(mobile);
    return 'expired';
  }
  if (e.attempts >= MAX_ATTEMPTS) return 'blocked';
  const a = Buffer.from(hash(mobile, otp));
  const b = Buffer.from(e.hash);
  if (a.length === b.length && timingSafeEqual(a, b)) {
    entries.delete(mobile);
    return 'ok';
  }
  e.attempts += 1;
  return 'wrong';
}
