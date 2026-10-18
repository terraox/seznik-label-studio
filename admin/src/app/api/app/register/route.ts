import { NextResponse } from 'next/server';

import { createAppToken } from '@/lib/app-session';
import { corsPreflight, withCors } from '@/lib/cors';
import { hashAppPassword } from '@/lib/app-passwords';
import { verifyOtpProof } from '@/lib/otp-proof';
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
      name?: string;
      mobile?: string;
      password?: string;
      otpProof?: string;
    };

    const name = (body.name ?? '').trim();
    const mobile = digitsOnly(body.mobile ?? '');
    const password = body.password ?? '';

    if (name.length < 2) {
      return withCors(NextResponse.json({ error: 'Enter your full name.' }, { status: 400 }));
    }
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return withCors(
        NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 }),
      );
    }
    if (!verifyOtpProof(body.otpProof, mobile, 'register')) {
      return withCors(
        NextResponse.json({ error: 'Verify your mobile number with OTP first.' }, { status: 403 }),
      );
    }
    if (password.length < 8) {
      return withCors(
        NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 }),
      );
    }

    const existing = await prisma.user.findUnique({ where: { mobile } });
    if (existing) {
      return withCors(
        NextResponse.json(
          { error: 'This number is already registered. Please log in.' },
          { status: 409 },
        ),
      );
    }

    const passwordHash = await hashAppPassword(password);
    const user = await prisma.user.create({
      data: { name, mobile, passwordHash },
    });

    const token = createAppToken(user.id);
    return withCors(
      NextResponse.json({ token, user: toUserDto(user), needsPrinter: true }, { status: 201 }),
    );
  } catch (err) {
    console.error('register failed', err);
    return withCors(NextResponse.json({ error: 'Registration failed.' }, { status: 500 }));
  }
}
