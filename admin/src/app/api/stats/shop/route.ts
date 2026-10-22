import { Prisma } from '@prisma/client';

import { footerInfo } from '@/lib/analytics-footer';
import { MONTH_START_IST } from '@/lib/analytics-sql';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { maskMobile } from '@/lib/phone';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  key: string; name: string; category: string; clicks: bigint; users: bigint;
  c7: bigint; cm: bigint; lastClick: Date;
};
type Day = { day: string; clicks: bigint };
type PersonRow = {
  id: string; name: string; mobile: string; key: string; product: string; category: string; clicks: bigint; last: Date;
};

/**
 * Taps on the shop's buy button, per product: total, distinct people, last 7 days, this month (India time).
 * With ?product=<key> it also returns that product's clicks per day for the last 30 India-time days.
 */
export async function GET(request: Request) {
  try {
    const admin = await requirePermission('analytics.view');
    const url = new URL(request.url);
    const hide = url.searchParams.get('internal') === 'hide';
    const product = url.searchParams.get('product');
    const clicks = Prisma.sql`
      clk AS (
        SELECT c.* FROM "ProductClick" c JOIN "AppUser" u ON u.id = c."userId"
        WHERE (${!hide} OR u."isInternal" = false)
      )`;

    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${clicks}
      SELECT "productKey" AS key,
        (array_agg("productNameSnapshot" ORDER BY "occurredAt" DESC))[1] AS name,
        (array_agg(category ORDER BY "occurredAt" DESC))[1] AS category,
        count(*) AS clicks, count(DISTINCT "userId") AS users,
        count(*) FILTER (WHERE "occurredAt" >= now() - interval '7 days') AS c7,
        count(*) FILTER (WHERE "occurredAt" >= ${MONTH_START_IST}) AS cm,
        max("occurredAt") AS "lastClick"
      FROM clk GROUP BY "productKey" ORDER BY count(*) DESC, "productKey"`);

    let trend: { day: string; clicks: number }[] | null = null;
    if (product) {
      const days = await prisma.$queryRaw<Day[]>(Prisma.sql`
        WITH ${clicks}
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day, count(clk.id) AS clicks
        FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 29, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') d
        LEFT JOIN clk ON clk."productKey" = ${product} AND (clk."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = d::date
        GROUP BY d ORDER BY d`);
      trend = days.map((d) => ({ day: d.day, clicks: Number(d.clicks) }));
    }
    // Who clicked what: one row per person and product, folded into one entry per person.
    const pairs = await prisma.$queryRaw<PersonRow[]>(Prisma.sql`
      WITH ${clicks}
      SELECT u.id, u.name, u.mobile, clk."productKey" AS key,
        (array_agg(clk."productNameSnapshot" ORDER BY clk."occurredAt" DESC))[1] AS product,
        (array_agg(clk.category ORDER BY clk."occurredAt" DESC))[1] AS category,
        count(*) AS clicks, max(clk."occurredAt") AS last
      FROM clk JOIN "AppUser" u ON u.id = clk."userId"
      GROUP BY u.id, u.name, u.mobile, clk."productKey"
      ORDER BY max(clk."occurredAt") DESC LIMIT 2000`);
    const seePhones = can(admin.role, 'users.phones');
    const byPerson = new Map<string, {
      id: string; name: string; mobile: string; clicks: number; lastClick: string;
      products: { key: string; name: string; category: string; clicks: number; lastClick: string }[];
    }>();
    for (const r of pairs) {
      const entry = byPerson.get(r.id) ?? { id: r.id, name: r.name, mobile: seePhones ? r.mobile : maskMobile(r.mobile), clicks: 0, lastClick: r.last.toISOString(), products: [] };
      entry.clicks += Number(r.clicks);
      if (r.last.toISOString() > entry.lastClick) entry.lastClick = r.last.toISOString();
      entry.products.push({ key: r.key, name: r.product, category: r.category, clicks: Number(r.clicks), lastClick: r.last.toISOString() });
      byPerson.set(r.id, entry);
    }
    const people = [...byPerson.values()]
      .map((p) => ({ ...p, products: p.products.sort((a, b) => b.lastClick.localeCompare(a.lastClick)) }))
      .sort((a, b) => b.lastClick.localeCompare(a.lastClick));

    return json({
      people,
      totalClicks: rows.reduce((t, r) => t + Number(r.clicks), 0),
      products: rows.map((r) => ({
        key: r.key, name: r.name, category: r.category, clicks: Number(r.clicks), users: Number(r.users),
        last7Days: Number(r.c7), thisMonth: Number(r.cm), lastClick: r.lastClick.toISOString(),
      })),
      trend,
      footer: await footerInfo(),
    });
  } catch (error) {
    return fail(error);
  }
}
