import { Prisma } from '@prisma/client';

import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { printerCtes } from '@/lib/analytics-sql';
import { prisma } from '@/lib/prisma';
import { PRINTER_LINES, printerLineLabel, printerLineOf, printerLineSql, type PrinterLineId } from '@/lib/printer-line';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeviceRow = {
  name: string; model: string; family: string; firstSeen: Date; connections: bigint;
  lastConnected: Date | null; labels: bigint; users: bigint;
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

    // Every Bluetooth / device name as the printer reports it, before models are merged.
    const deviceRows = await prisma.$queryRaw<DeviceRow[]>(Prisma.sql`
      WITH ${printerCtes(hideInternal)}
      SELECT p."nameRaw" AS name, p."modelNormalised" AS model, p."sdkFamily" AS family, p."firstSeenAt" AS "firstSeen",
        (SELECT count(*) FROM conn c WHERE c."printerId" = p.id) AS connections,
        (SELECT max(c."occurredAt") FROM conn c WHERE c."printerId" = p.id) AS "lastConnected",
        (SELECT COALESCE(sum(r."labelsCount"), 0) FROM prn r WHERE r."printerId" = p.id) AS labels,
        (SELECT count(DISTINCT x."userId") FROM (SELECT "userId" FROM conn WHERE conn."printerId" = p.id
           UNION SELECT "userId" FROM prn WHERE prn."printerId" = p.id AND "userId" IS NOT NULL) x) AS users
      FROM "Printer" p
      WHERE (${family === null} OR p."sdkFamily" = ${family ?? ''})
        AND (${!hideInternal} OR EXISTS (SELECT 1 FROM conn c WHERE c."printerId" = p.id) OR EXISTS (SELECT 1 FROM prn r WHERE r."printerId" = p.id))
      ORDER BY connections DESC, p."nameRaw"`);
    const devices = deviceRows.map((d) => ({
      name: d.name,
      line: printerLineOf(d.name),
      model: d.model,
      family: d.family,
      users: Number(d.users),
      connections: Number(d.connections),
      labels: Number(d.labels),
      firstSeen: d.firstSeen.toISOString(),
      lastConnected: d.lastConnected?.toISOString() ?? null,
    }));
    const lineUsers = await prisma.$queryRaw<{ line: string; users: bigint }[]>(Prisma.sql`
      WITH ${printerCtes(hideInternal)}
      SELECT ${printerLineSql(Prisma.sql`p."nameRaw"`)} AS line, count(DISTINCT x."userId") AS users
      FROM "Printer" p
      JOIN (SELECT "printerId", "userId" FROM conn
            UNION SELECT "printerId", "userId" FROM prn WHERE "userId" IS NOT NULL) x ON x."printerId" = p.id
      GROUP BY 1`);
    const usersByLine = new Map(lineUsers.map((r) => [r.line, Number(r.users)]));
    const printers = ([...PRINTER_LINES.map((l) => l.id), 'other'] as PrinterLineId[])
      .map((id) => {
        const mine = devices.filter((d) => d.line === id);
        return {
          key: id,
          model: printerLineLabel(id),
          family: mine.length ? [...new Set(mine.map((d) => d.family))].join(', ') : '',
          deviceNames: mine.length,
          users: usersByLine.get(id) ?? 0,
          connections: mine.reduce((n, d) => n + d.connections, 0),
          labels: mine.reduce((n, d) => n + d.labels, 0),
          firstSeen: mine.map((d) => d.firstSeen).sort()[0] ?? null,
          lastConnected: mine.map((d) => d.lastConnected).filter((x): x is string => !!x).sort().pop() ?? null,
        };
      })
      // The three product lines always show; "Other" only when something unmatched exists.
      .filter((l) => l.key !== 'other' || l.deviceNames > 0);
    const [withPrinter] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      WITH ${printerCtes(hideInternal)}
      SELECT count(*) AS n FROM (SELECT "userId" FROM conn UNION SELECT "userId" FROM prn WHERE "userId" IS NOT NULL) t`);
    return json({
      uniqueModels: printers.filter((p) => p.deviceNames > 0).length,
      uniqueNames: devices.length,
      totalConnections: printers.reduce((sum, p) => sum + p.connections, 0),
      usersWithPrinter: Number(withPrinter.n),
      printers,
      devices,
    });
  } catch (error) {
    return fail(error);
  }
}
