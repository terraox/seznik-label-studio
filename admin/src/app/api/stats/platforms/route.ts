import { Prisma } from '@prisma/client';

import { parseFilters, printEventsCte } from '@/lib/analytics-sql';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { day: string; platform: string | null; users: bigint };

/**
 * Active users per platform per day: people who sent at least one label to a printer that day
 * (India time), for the last 30 days. A user counts under the platform on their account.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('analytics.view');
    const { hideInternal, family } = parseFilters(new URL(request.url));
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${printEventsCte(hideInternal, family)}
      SELECT to_char((ev."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
             lower(u.platform) AS platform, count(DISTINCT ev."userId") AS users
      FROM ev JOIN "AppUser" u ON u.id = ev."userId"
      WHERE ev."occurredAt" >= now() - interval '31 days'
      GROUP BY 1, 2`);

    const today = new Date(Date.now() + 5.5 * 3600_000);
    const daily = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today.getTime() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
      const count = (p: string) => Number(rows.find((r) => r.day === d && r.platform === p)?.users ?? 0);
      return { day: d, android: count('android'), ios: count('ios'), web: count('web') };
    });
    return json({ daily, timezone: 'Asia/Kolkata' });
  } catch (error) {
    return fail(error);
  }
}
