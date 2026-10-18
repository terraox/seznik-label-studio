import { Prisma } from '@prisma/client';

import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { printerCtes } from '@/lib/analytics-sql';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  key: string; model: string; family: string; names: bigint; firstSeen: Date;
  connections: bigint; lastConnected: Date | null; labels: bigint; users: bigint;
};

/**
 * Unique printers grouped by model name (after alias rules): how many device names,
 * distinct users (connected or printed), connections, labels printed, first seen, last connected.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('analytics.view');
    const url = new URL(request.url);
    const hideInternal = url.searchParams.get('internal') === 'hide';
    const family = url.searchParams.get('family');

    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${printerCtes(hideInternal)},
      per AS (
        SELECT p.id, p."modelNormalised", p."sdkFamily", p."firstSeenAt",
          (SELECT count(*) FROM conn c WHERE c."printerId" = p.id) AS connections,
          (SELECT max(c."occurredAt") FROM conn c WHERE c."printerId" = p.id) AS "lastConnected",
          (SELECT COALESCE(sum(r."labelsCount"), 0) FROM prn r WHERE r."printerId" = p.id) AS labels
        FROM "Printer" p
        WHERE (${family === null} OR p."sdkFamily" = ${family ?? ''})
      ),
      users AS (
        SELECT lower(p."modelNormalised") AS key, count(DISTINCT x."userId") AS users
        FROM "Printer" p
        JOIN (SELECT "printerId", "userId" FROM conn
              UNION SELECT "printerId", "userId" FROM prn WHERE "userId" IS NOT NULL) x ON x."printerId" = p.id
        GROUP BY 1
      )
      SELECT lower(per."modelNormalised") AS key, min(per."modelNormalised") AS model,
        mode() WITHIN GROUP (ORDER BY per."sdkFamily") AS family,
        count(*) AS names, min(per."firstSeenAt") AS "firstSeen",
        sum(per.connections) AS connections, max(per."lastConnected") AS "lastConnected",
        sum(per.labels) AS labels, COALESCE(max(users.users), 0) AS users
      FROM per LEFT JOIN users ON users.key = lower(per."modelNormalised")
      WHERE (${!hideInternal} OR per.connections > 0 OR per.labels > 0)
      GROUP BY 1
      ORDER BY sum(per.connections) DESC, sum(per.labels) DESC, min(per."modelNormalised")`);

    const printers = rows.map((r) => ({
      key: r.key,
      model: r.model,
      family: r.family,
      deviceNames: Number(r.names),
      users: Number(r.users),
      connections: Number(r.connections),
      labels: Number(r.labels),
      firstSeen: r.firstSeen.toISOString(),
      lastConnected: r.lastConnected?.toISOString() ?? null,
    }));
    const [withPrinter] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      WITH ${printerCtes(hideInternal)}
      SELECT count(*) AS n FROM (SELECT "userId" FROM conn UNION SELECT "userId" FROM prn WHERE "userId" IS NOT NULL) t`);
    const names = await prisma.printer.count({
      where: family ? { sdkFamily: family } : undefined,
    });
    return json({
      uniqueModels: printers.length,
      uniqueNames: hideInternal ? printers.reduce((sum, p) => sum + p.deviceNames, 0) : names,
      totalConnections: printers.reduce((sum, p) => sum + p.connections, 0),
      usersWithPrinter: Number(withPrinter.n),
      printers,
    });
  } catch (error) {
    return fail(error);
  }
}
