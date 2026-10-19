import { Prisma } from '@prisma/client';

import { requirePermission } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { toAdminUserDto } from '@/lib/user-dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SORTS = ['createdAt', 'lastSeenAt', 'printCountTotal', 'name', 'lastLoginAt'] as const;

export async function GET(request: Request) {
  try {
    const admin = await requirePermission('users.view');
    const seePhones = can(admin.role, 'users.phones');
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const status = url.searchParams.get('status');
    const internal = url.searchParams.get('internal') ?? 'all';
    const sortParam = url.searchParams.get('sort') ?? 'createdAt';
    const sort = (SORTS as readonly string[]).includes(sortParam) ? sortParam : 'createdAt';
    const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 25));

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (q) {
      const field = url.searchParams.get('field') ?? 'all';
      const digits = q.replace(/\D/g, '');
      const has = (column: 'name' | 'printerName' | 'platform' | 'appVersion' | 'deviceModel') => ({
        [column]: { contains: q, mode: 'insensitive' as const },
      });
      const byMobile = digits && seePhones ? [{ mobile: { contains: digits.slice(-10) } }] : [];
      const pick: Record<string, Prisma.UserWhereInput[]> = {
        name: [has('name')],
        mobile: byMobile,
        printer: [has('printerName')],
        platform: [has('platform')],
        version: [has('appVersion')],
        device: [has('deviceModel')],
        all: [has('name'), ...byMobile, has('printerName'), has('platform'), has('appVersion'), has('deviceModel')],
      };
      where.OR = pick[field] ?? pick.all;
      if (where.OR.length === 0) where.OR = [{ id: '' }];
    }
    if (status === 'active' || status === 'blocked') where.status = status;
    if (internal === 'hide') where.isInternal = false;
    if (internal === 'only') where.isInternal = true;

    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [rows, total, all, blocked, fresh, internalCount, claimed] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, status: 'blocked' } }),
      prisma.user.count({ where: { deletedAt: null, createdAt: { gte: week } } }),
      prisma.user.count({ where: { deletedAt: null, isInternal: true } }),
      prisma.registeredPhone.count({ where: { blocked: true } }),
    ]);

    // Most recent printer each listed user connected, taken from connection events (no schema change needed).
    const lastPrinters = rows.length
      ? await prisma.$queryRaw<{ userId: string; model: string; transport: string | null; at: Date }[]>(Prisma.sql`
          SELECT DISTINCT ON (x."userId") x."userId", x.model, x.transport, x.at FROM (
            SELECT pc."userId" AS "userId", p."nameRaw" AS model, pc.transport AS transport, pc."occurredAt" AS at
            FROM "PrinterConnection" pc JOIN "Printer" p ON p.id = pc."printerId"
            WHERE pc."userId" IN (${Prisma.join(rows.map((r) => r.id))})
            UNION ALL
            -- A print proves that printer was connected, even when no separate connection event was sent.
            SELECT pe."userId", p."nameRaw", NULL, pe."occurredAt"
            FROM "PrintEvent" pe JOIN "Printer" p ON p.id = pe."printerId"
            WHERE pe."userId" IN (${Prisma.join(rows.map((r) => r.id))})
          ) x
          ORDER BY x."userId", x.at DESC`)
      : [];
    const lastPrinterByUser = new Map(lastPrinters.map((r) => [r.userId, { model: r.model, transport: r.transport ?? null, at: r.at.toISOString() }]));
    const recent = await prisma.printEvent.groupBy({
      by: ['userId'],
      where: { userId: { in: rows.map((r) => r.id) }, occurredAt: { gte: week } },
      _sum: { labelsCount: true },
    });
    const last7 = new Map(recent.map((r) => [r.userId, r._sum.labelsCount ?? 0]));
    return json({
      users: rows.map((row) => ({ ...toAdminUserDto(row, !seePhones), labelsLast7Days: last7.get(row.id) ?? 0, lastPrinter: lastPrinterByUser.get(row.id) ?? null })),
      total,
      page,
      pageSize,
      stats: {
        users: all,
        active: all - blocked,
        blocked,
        newLast7Days: fresh,
        internal: internalCount,
        blockedNumbers: claimed,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
