import { Prisma } from '@prisma/client';

import { parseFilters, printEventsCte } from '@/lib/analytics-sql';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { platform: string | null; jobs: bigint };

/**
 * Print jobs per phone platform, lifetime: every job a user sent to a printer, counted under the
 * platform on their account. Registrations per platform come from the summary endpoint.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('analytics.view');
    const { hideInternal, family } = parseFilters(new URL(request.url));
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${printEventsCte(hideInternal, family)}
      SELECT lower(u.platform) AS platform, COALESCE(sum(ev.jobs), 0) AS jobs
      FROM ev JOIN "AppUser" u ON u.id = ev."userId"
      GROUP BY 1`);
    const jobs = (p: string) => Number(rows.find((r) => r.platform === p)?.jobs ?? 0);
    return json({ jobs: { android: jobs('android'), ios: jobs('ios'), web: jobs('web') } });
  } catch (error) {
    return fail(error);
  }
}
