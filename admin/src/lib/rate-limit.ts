import { prisma } from './prisma';

/**
 * Fixed-window counter in Postgres (shared by every server process).
 * Counts the call, then says whether it was within `limit` for the current window.
 */
export async function hit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart", "updatedAt")
    VALUES (${key}, 1, now(), now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowMs / 1000})
                     THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowMs / 1000})
                           THEN now() ELSE "RateLimit"."windowStart" END,
      "updatedAt" = now()
    RETURNING "count", "windowStart"`;
  const { count, windowStart } = rows[0];
  if (count <= limit) return { allowed: true, retryAfter: 0 };
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000));
  return { allowed: false, retryAfter };
}

/** Forget a counter (for example after a successful login). */
export async function clear(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
