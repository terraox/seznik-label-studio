import { cleanName, itemDto, nextRevision } from '@/lib/catalog/service';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Rename, move to another category, change size or publish / unpublish. Send `If-Match: <revision>` to avoid overwriting a colleague's change. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('catalog.edit');
    const { id } = await ctx.params;
    const body = (await request.json()) as { name?: string; categoryId?: string; widthMm?: number | null; heightMm?: number | null; status?: string };
    const item = await prisma.catalogItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new HttpError(404, 'That item does not exist.');
    const match = request.headers.get('if-match');
    if (match !== null && Number(match) !== item.revision) {
      throw new HttpError(412, 'Someone else changed this item. Reload and try again.');
    }
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = cleanName(body.name);
      if (!name) throw new HttpError(400, 'Give the item a name.');
      data.name = name;
    }
    if (body.categoryId !== undefined) {
      const cat = await prisma.catalogCategory.findFirst({ where: { id: body.categoryId, deletedAt: null } });
      if (!cat) throw new HttpError(400, 'That category does not exist.');
      if (cat.kind !== item.kind) throw new HttpError(400, `That category is for ${cat.kind}.`);
      data.categoryId = cat.id;
    }
    for (const key of ['widthMm', 'heightMm'] as const) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (v !== null && !(typeof v === 'number' && v > 0 && v <= 1000)) throw new HttpError(400, 'Sizes are in mm, between 0 and 1000.');
        data[key] = v;
      }
    }
    if (body.status !== undefined) {
      if (body.status !== 'draft' && body.status !== 'published') throw new HttpError(400, 'Status must be draft or published.');
      data.status = body.status;
    }
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to change.');
    const saved = await prisma.$transaction(async (tx) => tx.catalogItem.update({ where: { id }, data: { ...data, revision: await nextRevision(tx) } }));
    return json({ item: itemDto(saved) });
  } catch (error) {
    return fail(error);
  }
}

/** Soft delete: the item disappears from the app on its next sync; stored files are kept (S3 clears them after 30 days). */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('catalog.edit');
    const { id } = await ctx.params;
    const item = await prisma.catalogItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new HttpError(404, 'That item does not exist.');
    await prisma.$transaction(async (tx) => {
      const revision = await nextRevision(tx);
      await tx.catalogItem.update({ where: { id }, data: { deletedAt: new Date(), revision } });
      await tx.catalogTombstone.upsert({ where: { itemId: id }, update: { revision, deletedAt: new Date() }, create: { itemId: id, revision } });
    });
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
