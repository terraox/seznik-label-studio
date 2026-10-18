import { NextResponse } from 'next/server';

import { corsPreflight, withCors } from '@/lib/cors';
import { checkOtp } from '@/lib/otp-store';
import { createOtpProof, parsePurpose } from '@/lib/otp-proof';

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      mobile?: string;
      otp?: string;
      purpose?: string;
    };
    const purpose = parsePurpose(body.purpose);
    const mobile = (body.mobile ?? '').replace(/\D/g, '');
    const otp = (body.otp ?? '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(mobile) || !otp) {
      return withCors(NextResponse.json({ error: 'Enter the OTP.' }, { status: 400 }));
    }
    const result = checkOtp(mobile, otp);
    if (result === 'blocked') {
      return withCors(
        NextResponse.json(
          { error: 'Too many wrong attempts. Request a new OTP.' },
          { status: 429 },
        ),
      );
    }
    if (result !== 'ok') {
      const error =
        result === 'expired'
          ? 'OTP expired. Request a new one.'
          : 'Incorrect OTP. Please try again.';
      return withCors(NextResponse.json({ error }, { status: 400 }));
    }

    return withCors(NextResponse.json({ ok: true, otpProof: createOtpProof(mobile, purpose) }));
  } catch (err) {
    console.error('otp verify failed', err);
    return withCors(NextResponse.json({ error: 'Could not verify OTP.' }, { status: 500 }));
  }
}
