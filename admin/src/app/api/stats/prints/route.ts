import { Prisma } from '@prisma/client';

import { MONTH_START_IST, parseFilters, printEventsCte } from '@/lib/analytics-sql';
import { footerInfo } from '@/lib/analytics-footer';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Totals = { labels: bigint; jobs: bigint; l7: bigint; j7: bigint; lm: bigint; jm: bigint; sevenFrom: Date; monthFrom: Date };
type Hour = { hour: number; labels: bigint; jobs: bigint };
type Day = { day: string; labels: bigint; jobs: bigint };

/**
 * Lifetime / last 7 days (rolling 7 x 24 h) / this calendar month (India time) of labels and jobs,
 * plus labels per day for the last 30 India-time days.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('analytics.view');
    const { hideInternal, family } = parseFilters(new URL(request.url));
    const [totals] = await prisma.$queryRaw<Totals[]>(Prisma.sql`
      WITH ${printEventsCte(hideInternal, family)}
      SELECT COALESCE(sum("labelsCount"), 0) AS labels, COALESCE(sum(jobs), 0) AS jobs,
        COALESCE(sum("labelsCount") FILTER (WHERE "occurredAt" >= now() - interval '7 days'), 0) AS l7,
        COALESCE(sum(jobs) FILTER (WHERE "occurredAt" >= now() - interval '7 days'), 0) AS j7,
        COALESCE(sum("labelsCount") FILTER (WHERE "occurredAt" >= ${MONTH_START_IST}), 0) AS lm,
        COALESCE(sum(jobs) FILTER (WHERE "occurredAt" >= ${MONTH_START_IST}), 0) AS jm,
        now() - interval '7 days' AS "sevenFrom", ${MONTH_START_IST} AS "monthFrom"
      FROM ev`);
    const days = await prisma.$queryRaw<Day[]>(Prisma.sql`
      WITH ${printEventsCte(hideInternal, family)}
      SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(sum(ev."labelsCount"), 0) AS labels, COALESCE(sum(ev.jobs), 0) AS jobs
      FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 29, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') d
      LEFT JOIN ev ON (ev."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = d::date
      GROUP BY d ORDER BY d`);
    const hours = await prisma.$queryRaw<Hour[]>(Prisma.sql`
      WITH ${printEventsCte(hideInternal, family)}
      SELECT h AS hour, COALESCE(sum(ev."labelsCount"), 0) AS labels, COALESCE(sum(ev.jobs), 0) AS jobs
      FROM generate_series(0, 23) h
      LEFT JOIN ev ON (ev."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND extract(hour FROM ev."occurredAt" AT TIME ZONE 'Asia/Kolkata')::int = h
      GROUP BY h ORDER BY h`);
    return json({
      lifetime: { labels: Number(totals.labels), jobs: Number(totals.jobs) },
      last7Days: { labels: Number(totals.l7), jobs: Number(totals.j7), from: totals.sevenFrom.toISOString() },
      thisMonth: { labels: Number(totals.lm), jobs: Number(totals.jm), from: totals.monthFrom.toISOString() },
      daily: days.map((d) => ({ day: d.day, labels: Number(d.labels), jobs: Number(d.jobs) })),
      hourly: hours.map((h) => ({ hour: Number(h.hour), labels: Number(h.labels), jobs: Number(h.jobs) })),
      timezone: 'Asia/Kolkata',
      footer: await footerInfo(),
    });
  } catch (error) {
    return fail(error);
  }
}
