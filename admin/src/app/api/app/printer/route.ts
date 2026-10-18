import { NextResponse } from 'next/server';

import { bearerUserId } from '@/lib/app-session';
import { corsPreflight, withCors } from '@/lib/cors';
import { isAppPrinterId, printerDisplayName } from '@/lib/printers';
import { prisma } from '@/lib/prisma';
import { toUserDto } from '@/lib/user-dto';

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const userId = bearerUserId(request.headers.get('authorization'));
  if (!userId) {
    return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  try {
    const body = (await request.json()) as { printerId?: string };
    if (!isAppPrinterId(body.printerId)) {
      return withCors(
        NextResponse.json({ error: 'Choose Tejas, Rudra, or Josh.' }, { status: 400 }),
      );
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { printerName: body.printerId },
    });

    return withCors(
      NextResponse.json({
        user: toUserDto(user),
        printerName: printerDisplayName(user.printerName),
        needsPrinter: false,
      }),
    );
  } catch (err) {
    console.error('set printer failed', err);
    return withCors(NextResponse.json({ error: 'Could not save printer.' }, { status: 500 }));
  }
}
