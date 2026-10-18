import { NextResponse } from 'next/server';

import { authenticateApp } from '@/lib/app-auth';
import { corsPreflight, withCors } from '@/lib/cors';
import { isAppPrinterId, printerDisplayName } from '@/lib/printers';
import { prisma } from '@/lib/prisma';
import { toUserDto } from '@/lib/user-dto';

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const auth = await authenticateApp(request);
  if (auth.error) return auth.error;
  const userId = auth.user.id;

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
