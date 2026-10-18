import { Prisma } from '@prisma/client';

import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { maskMobile } from '@/lib/phone';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { printerCtes } from '@/lib/analytics-sql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { id: string; name: string; mobile: string; connections: bigint; labels: bigint; lastConnected: Date | null };

/** Who uses one printer model: name, number (support only), times connected, labels printed. */
export async function GET(request: Request) {
  try {
    const admin = await requirePermission('users.view');
    const url = new URL(request.url);
    const key = (url.searchParams.get('model') ?? '').trim().toLowerCase();
    if (!key) throw new HttpError(400, 'Choose a printer model.');
    const hideInternal = url.searchParams.get('internal') === 'hide';
    const seePhones = can(admin.role, 'users.phones');

    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      WITH ${printerCtes(hideInternal)},
      pids AS (SELECT id FROM "Printer" WHERE lower("modelNormalised") = ${key}),
      who AS (
        SELECT "userId" FROM conn WHERE "printerId" IN (SELECT id FROM pids)
        UNION SELECT "userId" FROM prn WHERE "userId" IS NOT NULL AND "printerId" IN (SELECT id FROM pids)
      )
      SELECT u.id, u.name, u.mobile,
        (SELECT count(*) FROM conn c WHERE c."userId" = u.id AND c."printerId" IN (SELECT id FROM pids)) AS connections,
        (SELECT COALESCE(sum(r."labelsCount"), 0) FROM prn r WHERE r."userId" = u.id AND r."printerId" IN (SELECT id FROM pids)) AS labels,
        (SELECT max(c."occurredAt") FROM conn c WHERE c."userId" = u.id AND c."printerId" IN (SELECT id FROM pids)) AS "lastConnected"
      FROM "AppUser" u WHERE u.id IN (SELECT "userId" FROM who)
      ORDER BY connections DESC, labels DESC LIMIT 200`);

    return json({
      users: rows.map((r) => ({
        id: r.id,
        name: r.name,
        mobile: seePhones ? r.mobile : maskMobile(r.mobile),
        connections: Number(r.connections),
        labels: Number(r.labels),
        lastConnected: r.lastConnected?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
