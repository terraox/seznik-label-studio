import type { Prisma } from '@prisma/client';

import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { can } from '@/lib/permissions';
import { maskMobile } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'in_progress', 'done', 'declined'];

/**
 * "Can't find my template" requests with filters, a count per status and server paging.
 * Who sent it follows the Feedback rules: names for roles that see users, numbers for roles that see phones.
 */
export async function GET(request: Request) {
  try {
    const admin = await requirePermission('catalog.view');
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    const q = (url.searchParams.get('q') ?? '').trim();
    const hideInternal = url.searchParams.get('internal') === 'hide';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = 25;
    const seeUsers = can(admin.role, 'users.view');
    const seePhones = can(admin.role, 'users.phones');

    const base: Prisma.TemplateRequestWhereInput = hideInternal ? { user: { isInternal: false } } : {};
    const where: Prisma.TemplateRequestWhereInput = { ...base };
    if (STATUSES.includes(status)) where.status = status;
    if (q) {
      const digits = q.replace(/\D/g, '');
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { searchText: { contains: q, mode: 'insensitive' } },
        ...(seeUsers ? [{ user: { name: { contains: q, mode: 'insensitive' as const } } }] : []),
        ...(seePhones && digits.length >= 4 ? [{ user: { mobile: { contains: digits } } }] : []),
      ];
    }

    const [rows, total, byStatus] = await Promise.all([
      prisma.templateRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, mobile: true } } },
      }),
      prisma.templateRequest.count({ where }),
      prisma.templateRequest.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);

    return json({
      total,
      page,
      pageSize,
      counts: Object.fromEntries(STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?._count._all ?? 0])),
      items: rows.map((r) => ({
        id: r.id,
        description: r.description,
        widthMm: r.widthMm,
        heightMm: r.heightMm,
        shape: r.shape,
        searchText: r.searchText,
        status: r.status,
        adminNote: r.adminNote,
        appVersion: r.appVersion,
        platform: r.platform,
        createdAt: r.createdAt.toISOString(),
        user: seeUsers ? { name: r.user.name, mobile: seePhones ? r.user.mobile : maskMobile(r.user.mobile) } : null,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
