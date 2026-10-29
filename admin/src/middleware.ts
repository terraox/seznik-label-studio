import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE } from '@/lib/constants';
import { verifySession } from '@/lib/session';

const PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/app/',
  '/api/v1/',
  '/api/catalog-files/',
  '/api/health',
  '/_next',
  '/favicon',
  '/seznik_logo',
  '/icons',
  '/privacy',
  '/delete-account',
];

function isPublic(pathname: string) {
  if (pathname === '/login') return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    if (pathname === '/login') {
      const session = await verifySession(request.cookies.get(COOKIE)?.value);
      if (session) return NextResponse.redirect(new URL('/overview', request.url));
    }
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico|.*\\.png$).*)'],
};
