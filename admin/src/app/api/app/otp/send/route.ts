import { NextResponse } from 'next/server';

import { corsPreflight, withCors } from '@/lib/cors';
import { sendOtpSms } from '@/lib/msg91';
import { discardOtp, issueOtp } from '@/lib/otp-store';
import {
  RESEND_COOLDOWN_MS,
  recordSend,
  sendWaitSeconds,
} from '@/lib/otp-throttle';
import { parsePurpose } from '@/lib/otp-proof';
import { prisma } from '@/lib/prisma';

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      mobile?: string;
      purpose?: string;
    };
    const purpose = parsePurpose(body.purpose);
    const mobile = (body.mobile ?? '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return withCors(
        NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 }),
      );
    }

    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (purpose === 'register' && existing) {
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

    const { wait, capped } = sendWaitSeconds(mobile);
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

    const result = await sendOtpSms(mobile, issueOtp(mobile));
    if (!result.ok) {
      discardOtp(mobile);
      return withCors(NextResponse.json({ error: result.error }, { status: 502 }));
    }

    recordSend(mobile);
    return withCors(NextResponse.json({ ok: true, resendAfter: RESEND_COOLDOWN_MS / 1000 }));
  } catch (err) {
    console.error('otp send failed', err);
    return withCors(NextResponse.json({ error: 'Could not send OTP.' }, { status: 500 }));
  }
}
