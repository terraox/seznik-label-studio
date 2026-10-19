import { nextRevision } from '@/lib/catalog/service';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('catalog.edit');
    const { id } = await ctx.params;
    const body = (await request.json()) as { name?: string; sortOrder?: number };
    const cat = await prisma.catalogCategory.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw new HttpError(404, 'That category does not exist.');
    const data: { name?: string; sortOrder?: number } = {};
    if (body.name !== undefined) {
      const name = body.name.trim().slice(0, 60);
      if (!name) throw new HttpError(400, 'Give the category a name.');
      const clash = await prisma.catalogCategory.findFirst({ where: { kind: cat.kind, deletedAt: null, id: { not: id }, name: { equals: name, mode: 'insensitive' } } });
      if (clash) throw new HttpError(409, 'A category with that name already exists.');
      data.name = name;
    }
    if (body.sortOrder !== undefined) {
      if (!Number.isInteger(body.sortOrder)) throw new HttpError(400, 'Order must be a whole number.');
      data.sortOrder = body.sortOrder;
    }
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to change.');
    const saved = await prisma.catalogCategory.update({ where: { id }, data });
    await prisma.$transaction((tx) => nextRevision(tx));
    return json({ category: { id, kind: saved.kind, name: saved.name, sortOrder: saved.sortOrder } });
  } catch (error) {
    return fail(error);
  }
}

/** A category with live items cannot be deleted: move or delete them first. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('catalog.edit');
    const { id } = await ctx.params;
    const cat = await prisma.catalogCategory.findFirst({ where: { id, deletedAt: null } });
    if (!cat) throw new HttpError(404, 'That category does not exist.');
    const live = await prisma.catalogItem.count({ where: { categoryId: id, deletedAt: null } });
    if (live > 0) throw new HttpError(409, `This category still has ${live} item${live === 1 ? '' : 's'}. Move or delete them first.`);
    await prisma.catalogCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    await prisma.$transaction((tx) => nextRevision(tx));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
