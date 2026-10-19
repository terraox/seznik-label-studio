import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'reviewed', 'resolved'];
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('feedback.edit');
    const { id } = await ctx.params;
    const body = (await request.json()) as { status?: string; adminNote?: string };
    const before = await prisma.feedback.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'That feedback does not exist.');
    const data: { status?: string; adminNote?: string | null } = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Status must be new, reviewed or resolved.');
      data.status = body.status;
    }
    if (body.adminNote !== undefined) data.adminNote = body.adminNote.trim().slice(0, 1000) || null;
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to change.');
    const saved = await prisma.feedback.update({ where: { id }, data });
    return json({ ok: true, status: saved.status, adminNote: saved.adminNote });
  } catch (error) {
    return fail(error);
  }
}
