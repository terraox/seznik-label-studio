import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'in_progress', 'done', 'declined'];
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const { id } = await ctx.params;
    const body = (await request.json()) as { status?: string; adminNote?: string };
    const before = await prisma.templateRequest.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'That request does not exist.');
    const data: { status?: string; adminNote?: string | null } = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Status must be new, in_progress, done or declined.');
      data.status = body.status;
    }
    if (body.adminNote !== undefined) data.adminNote = body.adminNote.trim().slice(0, 1000) || null;
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to change.');
    const saved = await prisma.templateRequest.update({ where: { id }, data });
    return json({ ok: true, status: saved.status, adminNote: saved.adminNote });
  } catch (error) {
    return fail(error);
  }
}
