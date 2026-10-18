import { createHmac, randomInt, timingSafeEqual } from 'crypto';

import { OTP_EXPIRY_MINUTES, OTP_LENGTH } from '@/lib/msg91';
import { prisma } from '@/lib/prisma';
import { getSecret } from '@/lib/secrets';
import type { OtpPurpose } from '@/lib/otp-proof';

const MAX_ATTEMPTS = 5;

function hash(mobile: string, otp: string) {
  return createHmac('sha256', getSecret('OTP_HASH_SECRET')).update(`${mobile}:${otp}`).digest('hex');
}

/**
 * Developer bypass: OTP_DEV_BYPASS="9876543210:123456,9123456780:654321" gives those numbers a
 * fixed code and skips the SMS. Unset (the default) means off. List only your own test numbers.
 */
export function devBypassCode(mobile: string): string | null {
  for (const pair of (process.env.OTP_DEV_BYPASS ?? '').split(',')) {
    const [number, code] = pair.split(':').map((part) => part.trim());
    if (number === mobile && code && new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) return code;
  }
  return null;
}

/** Stores a fresh code (replacing older ones for this number) and returns it for sending. */
export async function issueOtp(mobile: string, purpose: OtpPurpose): Promise<string> {
  const otp = devBypassCode(mobile) ?? String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
  await prisma.$transaction([
    prisma.otpCode.deleteMany({ where: { mobile } }),
    prisma.otpCode.create({
      data: {
        mobile,
        purpose,
        codeHash: hash(mobile, otp),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
      },
    }),
  ]);
  return otp;
}

export async function discardOtp(mobile: string) {
  await prisma.otpCode.deleteMany({ where: { mobile } });
}

export async function checkOtp(
  mobile: string,
  otp: string,
): Promise<'ok' | 'wrong' | 'expired' | 'blocked'> {
  const row = await prisma.otpCode.findFirst({
    where: { mobile, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await prisma.otpCode.delete({ where: { id: row.id } });
    return 'expired';
  }
  if (row.attempts >= MAX_ATTEMPTS) return 'blocked';
  const a = Buffer.from(hash(mobile, otp));
  const b = Buffer.from(row.codeHash);
  if (a.length === b.length && timingSafeEqual(a, b)) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return 'ok';
  }
  await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
  return 'wrong';
}
