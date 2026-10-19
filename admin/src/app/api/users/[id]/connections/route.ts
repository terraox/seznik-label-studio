import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE = 30;

/** Older pages of a user's printer connection timeline: ?before=<ISO time of the last row seen>. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('users.view');
    const { id } = await ctx.params;
    const before = new Date(new URL(request.url).searchParams.get('before') ?? '');
    const rows = await prisma.printerConnection.findMany({
      where: { userId: id, ...(Number.isNaN(before.getTime()) ? {} : { occurredAt: { lt: before } }) },
      orderBy: { occurredAt: 'desc' },
      take: PAGE + 1,
      include: { printer: true },
    });
    return json({
      connections: rows.slice(0, PAGE).map((c) => ({
        id: c.id,
        at: c.occurredAt.toISOString(),
        printer: c.printer.nameRaw,
        family: c.printer.sdkFamily,
        transport: c.transport,
      })),
      more: rows.length > PAGE,
    });
  } catch (error) {
    return fail(error);
  }
}
