import { NextResponse } from 'next/server';

import {
  clearSessionCookie,
  createSessionToken,
  getAdminCredentials,
  getSessionUserId,
  sameText,
  sessionCookieValue,
} from '@/lib/admin-session';
import { APP_PRINTER_OPTIONS } from '@/lib/printers';

type Ctx = { params: Promise<{ path: string[] }> };

async function parseBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function notImplemented(path: string) {
  return NextResponse.json(
    {
      error: 'Not implemented yet',
      path: `/api/admin/${path}`,
      swagger: '/swagger',
      message: 'See /swagger for the full list of admin endpoints to implement.',
    },
    { status: 501 },
  );
}

async function handle(request: Request, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const path = (segments ?? []).join('/');
  const method = request.method.toUpperCase();

  if (path === 'login' && method === 'POST') {
    const body = (await parseBody(request)) as { userId?: string; password?: string } | null;
    const creds = getAdminCredentials();
    if (!creds) {
      return NextResponse.json({ error: 'This sign-in is not enabled.' }, { status: 503 });
    }
    if (
      !body?.userId ||
      !body.password ||
      !sameText(body.userId, creds.userId) ||
      !sameText(body.password, creds.password)
    ) {
      return NextResponse.json({ error: 'Invalid user ID or password' }, { status: 401 });
    }
    const token = createSessionToken(creds.userId);
    const res = NextResponse.json({ success: true, userId: creds.userId });
    res.cookies.set(sessionCookieValue(token));
    return res;
  }

  if (path === 'logout' && method === 'POST') {
    const res = NextResponse.json({ success: true });
    res.cookies.set(clearSessionCookie());
    return res;
  }

  if (path === 'me' && method === 'GET') {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    return NextResponse.json({ userId });
  }

  if (path === 'printers/catalog' && method === 'GET') {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    return NextResponse.json({
      printers: APP_PRINTER_OPTIONS.map((p) => ({
        id: p.id,
        printerName: p.printerName,
        shortName: p.shortName,
        bridge: p.bridge,
        tagline: p.tagline,
      })),
    });
  }

  // All other admin routes are inventoried in /swagger and intentionally not implemented yet.
  return notImplemented(path || '(root)');
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
