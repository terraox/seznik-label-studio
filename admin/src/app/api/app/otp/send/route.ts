import { NextResponse } from 'next/server';

import { corsPreflight, withCors } from '@/lib/cors';
import { sendOtpSms } from '@/lib/msg91';
import { blockedResponse, upgradeRequired } from '@/lib/app-auth';
import { devBypassCode, discardOtp, issueOtp } from '@/lib/otp-store';
import { RESEND_COOLDOWN_MS, takeSendSlot } from '@/lib/otp-throttle';
import { parsePurpose } from '@/lib/otp-proof';
import { normalizeMobile } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  try {
    const old = await upgradeRequired(request);
    if (old) return old;
    const body = (await request.json().catch(() => ({}))) as {
      mobile?: string;
      purpose?: string;
    };
    const purpose = parsePurpose(body.purpose);
    const mobile = normalizeMobile(body.mobile);
    if (!mobile) {
      return withCors(
        NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 }),
      );
    }

    const claim = await prisma.registeredPhone.findUnique({ where: { mobile } });
    if (purpose === 'register' && claim?.blocked) return blockedResponse(claim.blockReason);
    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (purpose === 'login' && existing?.status === 'blocked') return blockedResponse(existing.blockMessage);
    if (purpose === 'register' && (existing || claim)) {
      return withCors(
        NextResponse.json(
          { error: 'This number is already registered. Please log in.' },
          { status: 409 },
        ),
      );
    }
    if (purpose === 'login' && !existing) {
      return withCors(
        NextResponse.json(
          { error: 'No account found for this number. Please register.' },
          { status: 404 },
        ),
      );
    }

    const { wait, capped } = await takeSendSlot(mobile);
    if (wait > 0) {
      return withCors(
        NextResponse.json(
          {
            error: capped
              ? 'Too many OTP requests. Please try again later.'
              : `Please wait ${wait}s before requesting another OTP.`,
            retryAfter: wait,
          },
          { status: 429 },
        ),
      );
    }

    const otp = await issueOtp(mobile, purpose);
    const result = devBypassCode(mobile) ? { ok: true as const } : await sendOtpSms(mobile, otp);
    if (!result.ok) {
      await discardOtp(mobile);
      return withCors(NextResponse.json({ error: result.error }, { status: 502 }));
    }

    return withCors(NextResponse.json({ ok: true, resendAfter: RESEND_COOLDOWN_MS / 1000 }));
  } catch (err) {
    console.error('otp send failed', err);
    return withCors(NextResponse.json({ error: 'Could not send OTP.' }, { status: 500 }));
  }
}
