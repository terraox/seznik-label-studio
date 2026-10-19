import { NextResponse } from 'next/server';

import { blockedResponse, upgradeRequired } from '@/lib/app-auth';
import { verifyAppPassword } from '@/lib/app-passwords';
import { createAppToken } from '@/lib/app-session';
import { corsPreflight, withCors } from '@/lib/cors';
import { verifyOtpProof } from '@/lib/otp-proof';
import { normalizeMobile } from '@/lib/phone';
import { prisma } from '@/lib/prisma';
import { clear, hit } from '@/lib/rate-limit';
import { toUserDto } from '@/lib/user-dto';

export function OPTIONS() {
  return corsPreflight();
}

const reply = (body: unknown, status: number) => withCors(NextResponse.json(body, { status }));

const MAX_TRIES = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const old = await upgradeRequired(request);
    if (old) return old;

    const body = (await request.json()) as { mobile?: string; password?: string; otpProof?: string; platform?: string };
    const mobile = normalizeMobile(body.mobile);
    if (!mobile) return reply({ error: 'Enter a valid 10-digit mobile number.' }, 400);
    const password = body.password ?? '';

    const key = `login:${mobile}`;
    const attempt = await hit(key, MAX_TRIES, WINDOW_MS);
    if (!attempt.allowed) {
      return reply(
        { error: 'Too many tries. Please wait a few minutes and try again.', retryAfter: attempt.retryAfter },
        429,
      );
    }

    const user = await prisma.user.findUnique({ where: { mobile } });
    const viaOtp = !!body.otpProof && verifyOtpProof(body.otpProof, mobile, 'login');
    const ok = !!user && !user.deletedAt && (viaOtp || (await verifyAppPassword(password, user.passwordHash)));
    if (!ok || !user) {
      return reply(
        {
          error: body.otpProof
            ? 'OTP verification expired. Please try again.'
            : 'Incorrect phone number or password.',
        },
        401,
      );
    }

    // Only someone who proved who they are is told the account is blocked.
    if (user.status === 'blocked') return blockedResponse(user.blockMessage);

    const rawPlatform = (body.platform ?? request.headers.get('x-app-platform') ?? '').trim().toLowerCase();
    const platform = rawPlatform === 'android' || rawPlatform === 'ios' || rawPlatform === 'web' ? rawPlatform : null;
    await clear(key);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
        ...(platform ? { platform } : {}),
        ...(request.headers.get('x-app-device') ? { deviceModel: request.headers.get('x-app-device')!.slice(0, 60) } : {}),
        ...(request.headers.get('x-app-version') ? { appVersion: request.headers.get('x-app-version')!.slice(0, 40) } : {}),
      },
    });
    return reply(
      {
        token: createAppToken(updated.id, updated.tokenVersion),
        user: toUserDto(updated),
        needsPrinter: !updated.printerName,
      },
      200,
    );
  } catch (err) {
    console.error('app login failed', err);
    return reply({ error: 'Login failed.' }, 500);
  }
}
