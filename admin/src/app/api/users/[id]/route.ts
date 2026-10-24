import { requirePermission } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { toAdminUserDto } from '@/lib/user-dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONNECTION_PAGE = 30;

/** One line of the connection timeline. */
function connectionRow(c: { id: string; occurredAt: Date; transport: string; printer: { nameRaw: string; sdkFamily: string } }) {
  return { id: c.id, at: c.occurredAt.toISOString(), printer: c.printer.nameRaw, family: c.printer.sdkFamily, transport: c.transport };
}

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
    const [printerRows, firstConnections, recent, feedback, last7, clicks] = await Promise.all([
      prisma.userPrinter.findMany({ where: { userId: id }, orderBy: { lastConnectedAt: 'desc' }, include: { printer: true } }),
      prisma.printerConnection.findMany({ where: { userId: id }, orderBy: { occurredAt: 'desc' }, take: CONNECTION_PAGE + 1, include: { printer: true } }),
      prisma.printEvent.findMany({ where: { userId: id }, orderBy: { occurredAt: 'desc' }, take: 20, include: { printer: true } }),
      prisma.feedback.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.printEvent.aggregate({ where: { userId: id, occurredAt: { gte: week } }, _sum: { labelsCount: true } }),
      prisma.productClick.findMany({ where: { userId: id }, orderBy: { occurredAt: 'desc' }, take: 15 }),
    ]);
    const size = (e: (typeof recent)[number]) => `${Math.round(e.labelWidthMm * 10) / 10} x ${Math.round(e.labelHeightMm * 10) / 10} mm`;
    return json({
      user: { ...toAdminUserDto(rest as typeof user, !can(admin.role, 'users.phones')), labelsLast7Days: last7._sum.labelsCount ?? 0 },
      labelsLast7Days: last7._sum.labelsCount ?? 0,
      shopClicks: clicks.map((c) => ({ id: c.id, product: c.productNameSnapshot, category: c.category, at: c.occurredAt.toISOString() })),
      printers: printerRows.map((p) => ({
        id: p.printerId,
        model: p.printer.nameRaw,
        family: p.printer.sdkFamily,
        firstConnectedAt: p.firstConnectedAt.toISOString(),
        lastConnectedAt: p.lastConnectedAt.toISOString(),
        connections: p.connectionCount,
        labels: p.labelsPrinted,
        transport: p.lastTransport,
      })),
      connections: firstConnections.slice(0, CONNECTION_PAGE).map(connectionRow),
      moreConnections: firstConnections.length > CONNECTION_PAGE,
      recentPrints: recent.map((e) => ({
        at: e.occurredAt.toISOString(),
        printer: e.printer.nameRaw,
        label: `${e.templateId ? `${size(e)} · ${e.templateNameSnapshot ?? e.templateId}` : size(e)}${e.ups > 1 ? ` (Label across · ${e.ups} ups)` : ''}`,
        source: e.source,
        labels: e.labelsCount,
        jobs: e.jobs,
      })),
      feedback: feedback.map((f) => ({
        id: f.id,
        rating: f.rating,
        category: f.category,
        title: f.title,
        printerName: f.printerName,
        message: f.message,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
      })),
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
    return json({ user: toAdminUserDto(user) });
  } catch (error) {
    return fail(error);
  }
}
