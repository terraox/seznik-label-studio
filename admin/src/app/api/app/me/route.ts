import { NextResponse } from 'next/server';

import { bearerUserId } from '@/lib/app-session';
import { corsPreflight, withCors } from '@/lib/cors';
import { prisma } from '@/lib/prisma';
import { toUserDto } from '@/lib/user-dto';

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request) {
  const userId = bearerUserId(request.headers.get('authorization'));
  if (!userId) {
    return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  return withCors(
    NextResponse.json({
      user: toUserDto(user),
      needsPrinter: !user.printerName,
    }),
  );
}
