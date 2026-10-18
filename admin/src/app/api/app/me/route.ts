import { NextResponse } from 'next/server';

import { authenticateApp } from '@/lib/app-auth';
import { corsPreflight, withCors } from '@/lib/cors';
import { toUserDto } from '@/lib/user-dto';

export function OPTIONS() {
  return corsPreflight();
}

/** Session check: 401 = signed out, 403 USER_BLOCKED = blocked, otherwise the account. */
export async function GET(request: Request) {
  const auth = await authenticateApp(request);
  if (auth.error) return auth.error;
  return withCors(NextResponse.json({ user: toUserDto(auth.user), needsPrinter: !auth.user.printerName }));
}
