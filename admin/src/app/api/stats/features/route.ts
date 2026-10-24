import { Prisma } from '@prisma/client';

import { FEATURES, FEATURE_GROUPS } from '@/lib/features';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { key: string; clicks: bigint; c1: bigint; c7: bigint; c30: bigint; last: Date | null };
type Day = { day: string; clicks: bigint };

const RANGE_DAYS: Record<string, number | null> = { '1': 1, '7': 7, '30': 30, all: null };
const TODAY_IST = Prisma.sql`(now() AT TIME ZONE 'Asia/Kolkata')::date`;

/**
 * Most-clicked app sections, overall (counts are stored per day, without any user). ?range=1|7|30|all
 * picks the window for the ranking; ?feature=<key> narrows the daily chart (last 30 India-time days)
 * to one section. Sections nobody has tapped yet are listed with zero so the page always shows the full catalogue.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('analytics.view');
    const url = new URL(request.url);
    const range = url.searchParams.get('range') ?? '30';
    const days = Object.hasOwn(RANGE_DAYS, range) ? RANGE_DAYS[range] : 30;
    const feature = url.searchParams.get('feature');
    // "Today" = India time today; "Last 7 days" = today and the 6 days before it, India time.
    const since = days === null ? Prisma.sql`'1970-01-01'::date` : Prisma.sql`${TODAY_IST} - ${days - 1}::int`;

    const [rows, daily, first] = await Promise.all([
      prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "featureKey" AS key,
          COALESCE(sum(clicks) FILTER (WHERE day >= ${since}), 0) AS clicks,
          COALESCE(sum(clicks) FILTER (WHERE day >= ${TODAY_IST}), 0) AS c1,
          COALESCE(sum(clicks) FILTER (WHERE day >= ${TODAY_IST} - 6), 0) AS c7,
          COALESCE(sum(clicks) FILTER (WHERE day >= ${TODAY_IST} - 29), 0) AS c30,
          max(day)::timestamp AS last
        FROM "FeatureClickDaily" GROUP BY "featureKey"`),
      prisma.$queryRaw<Day[]>(Prisma.sql`
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(sum(f.clicks), 0) AS clicks
        FROM generate_series(${TODAY_IST} - 29, ${TODAY_IST}, interval '1 day') d
        LEFT JOIN "FeatureClickDaily" f ON f.day = d::date AND (${feature}::text IS NULL OR f."featureKey" = ${feature})
        GROUP BY d ORDER BY d`),
      prisma.featureClickDaily.aggregate({ _min: { day: true } }),
    ]);

    const byKey = new Map(rows.map((r) => [r.key, r]));
    const list = Object.entries(FEATURES).map(([key, meta]) => {
      const r = byKey.get(key);
      return {
        key, label: meta.label, group: meta.group,
        clicks: Number(r?.clicks ?? 0), today: Number(r?.c1 ?? 0), last7Days: Number(r?.c7 ?? 0), last30Days: Number(r?.c30 ?? 0),
        lastClick: r?.last?.toISOString() ?? null,
      };
    });
    const total = list.reduce((t, r) => t + r.clicks, 0);
    const features = list
      .map((r) => ({ ...r, share: total ? r.clicks / total : 0 }))
      .sort((a, b) => b.clicks - a.clicks || a.label.localeCompare(b.label));

    return json({
      range: days === null ? 'all' : String(days),
      total,
      trackingSince: first._min.day?.toISOString() ?? null,
      features,
      groups: FEATURE_GROUPS.map((g) => ({ id: g.id, label: g.label, clicks: features.filter((f) => f.group === g.id).reduce((t, f) => t + f.clicks, 0) })),
      trend: daily.map((d) => ({ day: d.day, clicks: Number(d.clicks) })),
    });
  } catch (error) {
    return fail(error);
  }
}
