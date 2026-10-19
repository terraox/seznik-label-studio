import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

import { blockedResponse, upgradeRequired } from '@/lib/app-auth';
import { hashAppPassword } from '@/lib/app-passwords';
import { createAppToken } from '@/lib/app-session';
import { corsPreflight, withCors } from '@/lib/cors';
import { verifyOtpProof } from '@/lib/otp-proof';
import { normalizeMobile } from '@/lib/phone';
import { prisma } from '@/lib/prisma';
import { toUserDto } from '@/lib/user-dto';

export function OPTIONS() {
  return corsPreflight();
}

/** Only the two phone types the desk shows are stored. */
function cleanPlatform(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'android' || v === 'ios' || v === 'web' ? v : null;
}

/** First letter of a new user's ID shows where they registered: A Android, I iOS, W web (X unknown). */
function userId(platform: string | null): string {
  const letter = platform === 'android' ? 'A' : platform === 'ios' ? 'I' : platform === 'web' ? 'W' : 'X';
  return letter + randomBytes(9).toString('base64url').replace(/[-_]/g, '').toLowerCase().padEnd(12, '0').slice(0, 12);
}

const TAKEN = 'This number is already registered. Please log in.';

const reply = (body: unknown, status: number) => withCors(NextResponse.json(body, { status }));

export async function POST(request: Request) {
  try {
    const old = await upgradeRequired(request);
    if (old) return old;

    const body = (await request.json()) as {
      name?: string;
      mobile?: string;
      password?: string;
      otpProof?: string;
      platform?: string;
    };

    const name = (body.name ?? '').trim();
    const mobile = normalizeMobile(body.mobile);
    const password = body.password ?? '';

    if (name.length < 2) return reply({ error: 'Enter your full name.' }, 400);
    if (!mobile) return reply({ error: 'Enter a valid 10-digit mobile number.' }, 400);
    if (!verifyOtpProof(body.otpProof, mobile, 'register')) {
      return reply({ error: 'Verify your mobile number with OTP first.' }, 403);
    }
    if (password.length < 8) return reply({ error: 'Password must be at least 8 characters.' }, 400);

    // A number is claimed for good: once registered (or pre-blocked by an admin) it cannot sign up again.
    const claim = await prisma.registeredPhone.findUnique({ where: { mobile } });
    if (claim?.blocked) return blockedResponse(claim.blockReason);
    if (claim) return reply({ error: TAKEN, code: 'PHONE_TAKEN' }, 409);

    const platform = cleanPlatform(body.platform ?? request.headers.get('x-app-platform'));
    const passwordHash = await hashAppPassword(password);
    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            id: userId(platform),
            name,
            mobile,
            passwordHash,
            passwordUpdatedAt: new Date(),
            platform,
            appVersion: request.headers.get('x-app-version')?.slice(0, 40) ?? null,
            deviceModel: request.headers.get('x-app-device')?.slice(0, 60) ?? null,
            lastSeenAt: new Date(),
          },
        });
        await tx.registeredPhone.create({ data: { mobile, userId: created.id } });
        return created;
      });
      return reply(
        { token: createAppToken(user.id, user.tokenVersion), user: toUserDto(user), needsPrinter: true },
        201,
      );
    } catch (err) {
      // Two sign-ups racing for the same number: the unique keys let exactly one win.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply({ error: TAKEN, code: 'PHONE_TAKEN' }, 409);
      }
      throw err;
    }
  } catch (err) {
    console.error('register failed', err);
    return reply({ error: 'Registration failed.' }, 500);
  }
}
