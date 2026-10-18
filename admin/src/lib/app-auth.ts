import { NextResponse } from 'next/server';
import type { User } from '@prisma/client';

import { bearerToken, verifyAppToken } from './app-session';
import { readAppConfig } from './app-config';
import { withCors } from './cors';
import { prisma } from './prisma';

export const DEFAULT_BLOCK_TEXT = 'Your account has been blocked. Please contact the admin to resolve this.';
const SEEN_EVERY_MS = 5 * 60 * 1000;

/**
 * 403 for a blocked account. `error` is plain text so older app builds, which only show
 * `error` on the login screen, still display the message; newer builds read `code`.
 */
export async function blockedResponse(message: string | null | undefined) {
  const contact = (await readAppConfig()).adminContact;
  const extra = message?.trim();
  return withCors(
    NextResponse.json(
      {
        error: extra ? `${DEFAULT_BLOCK_TEXT} ${extra}` : DEFAULT_BLOCK_TEXT,
        code: 'USER_BLOCKED',
        message: extra || null,
        contact,
      },
      { status: 403 },
    ),
  );
}

export type AppAuth = { user: User; error?: undefined } | { user?: undefined; error: NextResponse };

/**
 * Checks the bearer token against the database on every call: the user must exist, not be
 * blocked, and the token must carry the user's current tokenVersion. Tokens issued before
 * versions existed stay valid only while the version is still 0.
 */
export async function authenticateApp(request: Request): Promise<AppAuth> {
  const unauthorized = () => ({
    error: withCors(NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })),
  });
  const claims = verifyAppToken(bearerToken(request.headers.get('authorization')));
  if (!claims) return unauthorized();

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (!user || user.deletedAt) return unauthorized();
  if (user.status === 'blocked') return { error: await blockedResponse(user.blockMessage) };

  const versionOk =
    claims.tokenVersion === null ? user.tokenVersion === 0 : claims.tokenVersion === user.tokenVersion;
  if (!versionOk) return unauthorized();

  // Keep "last seen" and the reported app details fresh without a write on every request.
  const version = request.headers.get('x-app-version');
  const platform = request.headers.get('x-app-platform');
  const stale = !user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > SEEN_EVERY_MS;
  if (stale || (version && version !== user.appVersion)) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastSeenAt: new Date(),
        ...(version ? { appVersion: version.slice(0, 40) } : {}),
        ...(platform ? { platform: platform.slice(0, 20) } : {}),
      },
    });
  }
  return { user };
}

/** 426 when the build is too old: no X-App-Build header while legacyCutoff is on, or below minAppBuild. */
export async function upgradeRequired(request: Request): Promise<NextResponse | null> {
  const config = await readAppConfig();
  const raw = request.headers.get('x-app-build');
  const build = raw === null ? null : Number(raw);
  const tooOld =
    (config.legacyCutoff && build === null) ||
    (build !== null && Number.isFinite(build) && build < config.minAppBuild);
  if (!tooOld) return null;
  return withCors(
    NextResponse.json(
      { error: 'Please update the app from the store to continue.', code: 'UPGRADE_REQUIRED' },
      { status: 426 },
    ),
  );
}
