import { Prisma } from '@prisma/client';

import { footerInfo } from '@/lib/analytics-footer';
import { parseFilters, printEventsCte } from '@/lib/analytics-sql';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dashboard header: users, prints, printer models, rating, new sign-ups. */
export async function GET(request: Request) {
  try {
    await requirePermission('overview.view');
    const { hideInternal, family } = parseFilters(new URL(request.url));
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const userWhere = { deletedAt: null, ...(hideInternal ? { isInternal: false } : {}) };
    const [users, blocked, fresh, internal, rating, models, prints] = await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.user.count({ where: { ...userWhere, status: 'blocked' } }),
      prisma.user.count({ where: { ...userWhere, createdAt: { gte: week } } }),
      prisma.user.count({ where: { deletedAt: null, isInternal: true } }),
      prisma.feedback.aggregate({
        _avg: { rating: true },
        _count: { _all: true },
        where: hideInternal ? { user: { isInternal: false } } : undefined,
      }),
      prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        WITH ev AS (
          SELECT pe."printerId" FROM "PrintEvent" pe LEFT JOIN "AppUser" u ON u.id = pe."userId"
          WHERE (${!hideInternal} OR COALESCE(u."isInternal", false) = false)
          UNION
          SELECT pc."printerId" FROM "PrinterConnection" pc JOIN "AppUser" u ON u.id = pc."userId"
          WHERE (${!hideInternal} OR u."isInternal" = false)
        )
        SELECT count(DISTINCT lower(p."modelNormalised")) AS n FROM "Printer" p WHERE p.id IN (SELECT "printerId" FROM ev)`),
      prisma.$queryRaw<{ labels: bigint }[]>(Prisma.sql`
        WITH ${printEventsCte(hideInternal, family)} SELECT COALESCE(sum("labelsCount"), 0) AS labels FROM ev`),
    ]);
    return json({
      users: { total: users, active: users - blocked, blocked, newLast7Days: fresh, internalAccounts: internal },
      prints: { lifetimeLabels: Number(prints[0].labels) },
      printerModels: Number(models[0].n),
      rating: { average: rating._avg.rating === null ? null : Math.round(rating._avg.rating * 100) / 100, count: rating._count._all },
      excludesInternal: hideInternal,
      footer: await footerInfo(),
    });
  } catch (error) {
    return fail(error);
  }
}
