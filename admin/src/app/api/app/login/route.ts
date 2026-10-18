import { NextResponse } from 'next/server';

import { verifyAppPassword } from '@/lib/app-passwords';
import { createAppToken } from '@/lib/app-session';
import { verifyOtpProof } from '@/lib/otp-proof';
import { corsPreflight, withCors } from '@/lib/cors';
import { prisma } from '@/lib/prisma';
import { toUserDto } from '@/lib/user-dto';

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mobile?: string;
      password?: string;
      otpProof?: string;
    };
    const mobile = digitsOnly(body.mobile ?? '');
    const password = body.password ?? '';

    const user = await prisma.user.findUnique({ where: { mobile } });
    const viaOtp = !!body.otpProof && verifyOtpProof(body.otpProof, mobile, 'login');
    if (!user || !(viaOtp || (await verifyAppPassword(password, user.passwordHash)))) {
      return withCors(
        NextResponse.json(
          {
            error: body.otpProof
              ? 'OTP verification expired. Please try again.'
              : 'Incorrect phone number or password.',
          },
          { status: 401 },
        ),
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = createAppToken(updated.id);
    return withCors(
      NextResponse.json({
        token,
        user: toUserDto(updated),
        needsPrinter: !updated.printerName,
      }),
    );
  } catch (err) {
    console.error('app login failed', err);
    return withCors(NextResponse.json({ error: 'Login failed.' }, { status: 500 }));
  }
}
