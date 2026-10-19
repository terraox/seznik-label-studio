import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { asKind, cleanName, tables } from '@/lib/library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ kind: string; id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const { kind, id } = await ctx.params;
    const t = tables(asKind(kind));
    const name = cleanName(((await request.json().catch(() => ({}))) as { name?: string }).name).slice(0, 60);
    if (!name) throw new HttpError(400, 'Give the category a name.');
    const clash = await t.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
    if (clash) throw new HttpError(409, 'There is already a category with that name.');
    if (!(await t.category.findUnique({ where: { id } }))) throw new HttpError(404, 'That category does not exist.');
    const saved = await t.category.update({ where: { id }, data: { name } });
    return json({ category: { id: saved.id, name: saved.name } });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const { kind, id } = await ctx.params;
    const t = tables(asKind(kind));
    if (!(await t.category.findUnique({ where: { id } }))) throw new HttpError(404, 'That category does not exist.');
    if ((await t.item.count({ where: { categoryId: id } })) > 0) {
      throw new HttpError(409, 'This category still has items. Move or delete them first.');
    }
    await t.category.delete({ where: { id } });
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
