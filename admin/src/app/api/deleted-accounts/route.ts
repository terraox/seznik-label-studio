import type { Prisma } from '@prisma/client';

import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { can } from '@/lib/permissions';
import { maskMobile } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Accounts deleted from the app. Name and reason always; phone only for roles with users.phones.
 */
export async function GET(request: Request) {
  try {
    const admin = await requirePermission('users.view');
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const hideInternal = url.searchParams.get('internal') === 'hide';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = 25;
    const seePhones = can(admin.role, 'users.phones');

    const where: Prisma.DeletedAccountWhereInput = {};
    if (hideInternal) where.isInternal = false;
    if (from || to) {
      where.deletedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(new Date(to).getTime() + 86_400_000) } : {}),
      };
    }
    if (q) {
      const digits = q.replace(/\D/g, '');
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
        { printerName: { contains: q, mode: 'insensitive' } },
        ...(seePhones && digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.deletedAccount.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.deletedAccount.count({ where }),
    ]);

    return json({
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id,
        formerUserId: r.formerUserId,
        name: r.name,
        mobile: seePhones ? r.mobile : maskMobile(r.mobile),
        printerName: r.printerName,
        labelsPrinted: r.labelsPrinted,
        reason: r.reason,
        registeredAt: r.registeredAt?.toISOString() ?? null,
        deletedAt: r.deletedAt.toISOString(),
        isInternal: r.isInternal,
        appVersion: r.appVersion,
        platform: r.platform,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
