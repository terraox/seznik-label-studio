import type { Prisma } from '@prisma/client';

import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { can } from '@/lib/permissions';
import { maskMobile } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Feedback inbox with filters, a summary (average, count, 1-5 distribution) and server paging.
 * Who sent it (name, number) is shown only to roles that may see users; numbers only to roles that may see phones.
 */
export async function GET(request: Request) {
  try {
    const admin = await requirePermission('feedback.view');
    const url = new URL(request.url);
    const rating = Number(url.searchParams.get('rating')) || 0;
    const category = url.searchParams.get('category') || '';
    const status = url.searchParams.get('status') || '';
    const q = (url.searchParams.get('q') ?? '').trim();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const hideInternal = url.searchParams.get('internal') === 'hide';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = 25;
    const seeUsers = can(admin.role, 'users.view');
    const seePhones = can(admin.role, 'users.phones');

    const where: Prisma.FeedbackWhereInput = {};
    if (rating >= 1 && rating <= 5) where.rating = rating;
    if (category) where.category = category;
    if (status) where.status = status;
    if (hideInternal) where.user = { isInternal: false };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(new Date(to).getTime() + 86_400_000) } : {}),
      };
    }
    if (q) {
      const digits = q.replace(/\D/g, '');
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
        { printerName: { contains: q, mode: 'insensitive' } },
        ...(seeUsers ? [{ user: { name: { contains: q, mode: 'insensitive' as const } } }] : []),
        ...(seePhones && digits.length >= 4 ? [{ user: { mobile: { contains: digits } } }] : []),
      ];
    }

    const base: Prisma.FeedbackWhereInput = hideInternal ? { user: { isInternal: false } } : {};
    const [rows, total, dist, avg] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, mobile: true } } },
      }),
      prisma.feedback.count({ where }),
      prisma.feedback.groupBy({ by: ['rating'], where: base, _count: { _all: true } }),
      prisma.feedback.aggregate({ where: base, _avg: { rating: true }, _count: { _all: true } }),
    ]);

    return json({
      total,
      page,
      pageSize,
      summary: {
        count: avg._count._all,
        average: avg._avg.rating === null ? null : Math.round(avg._avg.rating * 100) / 100,
        distribution: [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: dist.find((d) => d.rating === r)?._count._all ?? 0 })),
      },
      items: rows.map((f) => ({
        id: f.id,
        rating: f.rating,
        category: f.category,
        title: f.title,
        printerName: f.printerName,
        message: f.message,
        status: f.status,
        adminNote: f.adminNote,
        appVersion: f.appVersion,
        platform: f.platform,
        createdAt: f.createdAt.toISOString(),
        user: seeUsers ? { name: f.user.name, mobile: seePhones ? f.user.mobile : maskMobile(f.user.mobile) } : null,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
