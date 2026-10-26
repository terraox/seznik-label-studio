import { NextResponse } from 'next/server';

import { authenticateApp, upgradeRequired } from '@/lib/app-auth';
import { corsPreflight, withCors } from '@/lib/cors';
import { prisma } from '@/lib/prisma';

export function OPTIONS() {
  return corsPreflight();
}

const reply = (body: unknown, status: number) => withCors(NextResponse.json(body, { status }));

const MIN_REASON = 3;
const MAX_REASON = 500;

/**
 * User-initiated account deletion from Settings.
 * Archives name / mobile / printer / labels / reason, then hard-deletes the AppUser row
 * (cascades personal data; print events stay with userId null; number freed unless admin-blocked).
 */
export async function POST(request: Request) {
  try {
    const old = await upgradeRequired(request);
    if (old) return old;

    const auth = await authenticateApp(request);
    if (auth.error) return auth.error;

    const body = (await request.json().catch(() => null)) as { reason?: string } | null;
    const reason = (body?.reason ?? '').trim();
    if (reason.length < MIN_REASON) {
      return reply({ error: 'Please tell us why you are deleting your account.' }, 400);
    }
    if (reason.length > MAX_REASON) {
      return reply({ error: `Reason must be at most ${MAX_REASON} characters.` }, 400);
    }

    const user = auth.user;

    await prisma.$transaction(async (tx) => {
      await tx.deletedAccount.create({
        data: {
          formerUserId: user.id,
          name: user.name,
          mobile: user.mobile,
          printerName: user.printerName,
          labelsPrinted: user.printCountTotal,
          reason,
          registeredAt: user.createdAt,
          isInternal: user.isInternal,
          appVersion: user.appVersion,
          platform: user.platform,
        },
      });

      // Free the number so it can register again; an admin block stays in place.
      await tx.registeredPhone.deleteMany({ where: { userId: user.id, blocked: false } });
      await tx.registeredPhone.updateMany({
        where: { userId: user.id },
        data: { userId: null },
      });

      // Hard delete: cascades status events, connections, user-printers, feedback,
      // template requests, product clicks. PrintEvent.userId becomes null (onDelete: SetNull).
      await tx.user.delete({ where: { id: user.id } });
    });

    return reply({ ok: true }, 200);
  } catch (err) {
    console.error('account delete failed', err);
    return reply({ error: 'Could not delete your account. Please try again.' }, 500);
  }
}
