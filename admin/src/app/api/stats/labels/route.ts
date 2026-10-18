import { Prisma } from '@prisma/client';

import { footerInfo } from '@/lib/analytics-footer';
import { MONTH_START_IST, parseFilters, printEventsCte } from '@/lib/analytics-sql';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  labelKey: string; w: number; h: number; templateId: string | null; templateName: string | null;
  labels: bigint; jobs: bigint; users: bigint;
};

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Most printed labels. Manual sizes show as "50 x 30 mm"; library templates as
 * "50 x 30 mm · Template name" (latest name seen; renaming never splits the count because
 * the key uses the template id).
 */
export async function GET(request: Request) {
  try {
    await requirePermission('analytics.view');
    const url = new URL(request.url);
    const { hideInternal, family } = parseFilters(url);
    const window = url.searchParams.get('window') ?? 'all';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const since =
      window === '7d' ? Prisma.sql`now() - interval '7 days'`
      : window === 'month' ? MONTH_START_IST
      : Prisma.sql`'-infinity'::timestamptz`;

    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${printEventsCte(hideInternal, family)}
      SELECT "labelKey", min("labelWidthMm") AS w, min("labelHeightMm") AS h,
        min("templateId") AS "templateId",
        (array_agg("templateNameSnapshot" ORDER BY "occurredAt" DESC) FILTER (WHERE "templateNameSnapshot" IS NOT NULL))[1] AS "templateName",
        sum("labelsCount") AS labels, sum(jobs) AS jobs, count(DISTINCT "userId") AS users
      FROM ev WHERE "occurredAt" >= ${since}
      GROUP BY "labelKey"
      ORDER BY sum("labelsCount") DESC, "labelKey"
      LIMIT ${limit}`);

    return json({
      window,
      labels: rows.map((r, i) => ({
        rank: i + 1,
        labelKey: r.labelKey,
        display: `${fmt(r.w)} x ${fmt(r.h)} mm${r.templateId ? ` · ${r.templateName ?? r.templateId}` : ''}`,
        kind: r.templateId ? 'template' : 'manual',
        templateId: r.templateId,
        labelsPrinted: Number(r.labels),
        jobs: Number(r.jobs),
        users: Number(r.users),
      })),
      footer: await footerInfo(),
    });
  } catch (error) {
    return fail(error);
  }
}
