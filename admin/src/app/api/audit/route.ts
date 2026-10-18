import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requirePermission('audit.view');
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = 50;
    const [rows, total] = await Promise.all([
      prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.adminAuditLog.count(),
    ]);
    return json({
      total,
      page,
      pageSize,
      entries: rows.map((row) => ({
        id: row.id,
        adminEmail: row.adminEmail,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return fail(error);
  }
}
