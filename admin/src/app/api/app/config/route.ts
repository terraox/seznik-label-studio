import { NextResponse } from 'next/server';

import { readAppConfig } from '@/lib/app-config';
import { corsPreflight, withCors } from '@/lib/cors';

export function OPTIONS() {
  return corsPreflight();
}

/** Public settings the app reads without signing in (admin contact for the blocked screen, minimum build). */
export async function GET() {
  const res = NextResponse.json(await readAppConfig());
  res.headers.set('Cache-Control', 'public, max-age=60');
  return withCors(res);
}
