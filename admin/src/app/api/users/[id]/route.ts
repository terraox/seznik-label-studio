import { requirePermission } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { toAdminUserDto } from '@/lib/user-dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('users.view');
    const { id } = await ctx.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: { statusEvents: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!user) throw new HttpError(404, 'That user does not exist.');
    const { statusEvents, ...rest } = user;
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [connections, printed, recent, feedback, last7] = await Promise.all([
      prisma.printerConnection.groupBy({ by: ['printerId'], where: { userId: id }, _count: { _all: true }, _max: { occurredAt: true } }),
      prisma.printEvent.groupBy({ by: ['printerId'], where: { userId: id }, _sum: { labelsCount: true } }),
      prisma.printEvent.findMany({ where: { userId: id }, orderBy: { occurredAt: 'desc' }, take: 20, include: { printer: true } }),
      prisma.feedback.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.printEvent.aggregate({ where: { userId: id, occurredAt: { gte: week } }, _sum: { labelsCount: true } }),
    ]);
    const printers = await prisma.printer.findMany({ where: { id: { in: [...new Set([...connections.map((c) => c.printerId), ...printed.map((p) => p.printerId)])] } } });
    const byModel = new Map<string, { model: string; family: string; connections: number; labels: number; lastConnected: string | null }>();
    for (const p of printers) {
      const key = p.modelNormalised.toLowerCase();
      const row = byModel.get(key) ?? { model: p.modelNormalised, family: p.sdkFamily, connections: 0, labels: 0, lastConnected: null };
      const c = connections.find((x) => x.printerId === p.id);
      row.connections += c?._count._all ?? 0;
      row.labels += printed.find((x) => x.printerId === p.id)?._sum.labelsCount ?? 0;
      const last = c?._max.occurredAt?.toISOString() ?? null;
      if (last && (!row.lastConnected || last > row.lastConnected)) row.lastConnected = last;
      byModel.set(key, row);
    }
    const size = (e: (typeof recent)[number]) => `${Math.round(e.labelWidthMm * 10) / 10} x ${Math.round(e.labelHeightMm * 10) / 10} mm`;
    return json({
      user: { ...toAdminUserDto(rest as typeof user, !can(admin.role, 'users.phones')), labelsLast7Days: last7._sum.labelsCount ?? 0 },
      printers: [...byModel.values()].sort((a, b) => b.labels - a.labels),
      recentPrints: recent.map((e) => ({
        at: e.occurredAt.toISOString(),
        printer: e.printer.modelNormalised,
        label: e.templateId ? `${size(e)} · ${e.templateNameSnapshot ?? e.templateId}` : size(e),
        source: e.source,
        labels: e.labelsCount,
        jobs: e.jobs,
      })),
      feedback: feedback.map((f) => ({ id: f.id, rating: f.rating, category: f.category, message: f.message, status: f.status, createdAt: f.createdAt.toISOString() })),
      history: statusEvents.map((event) => ({
        id: event.id,
        action: event.action,
        message: event.message,
        internalNote: event.internalNote,
        adminEmail: event.adminEmail,
        createdAt: event.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

/** Editable by support staff: the internal-account flag. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('users.block');
    const { id } = await ctx.params;
    const body = (await request.json()) as { isInternal?: boolean };
    if (typeof body.isInternal !== 'boolean') throw new HttpError(400, 'Nothing to change.');
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'That user does not exist.');
    const user = await prisma.user.update({ where: { id }, data: { isInternal: body.isInternal } });
    await audit(admin, 'user.internal', 'user', id, { isInternal: before.isInternal }, { isInternal: user.isInternal }, request);
    return json({ user: toAdminUserDto(user) });
  } catch (error) {
    return fail(error);
  }
}
