import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { asKind, cleanName, tables } from '@/lib/library';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ kind: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.view');
    const t = tables(asKind((await ctx.params).kind));
    const [rows, all] = await Promise.all([
      t.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { [t.itemRelation]: true } } } }),
      t.item.count(),
    ]);
    return json({ categories: rows.map((c) => ({ id: c.id, name: c.name, items: c._count[t.itemRelation] as number })), all });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const t = tables(asKind((await ctx.params).kind));
    const name = cleanName(((await request.json().catch(() => ({}))) as { name?: string }).name).slice(0, 60);
    if (!name) throw new HttpError(400, 'Give the category a name.');
    if (await t.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) {
      throw new HttpError(409, 'There is already a category with that name.');
    }
    const last = await t.category.aggregate({ _max: { sortOrder: true } });
    const created = await t.category.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    return json({ category: { id: created.id, name: created.name, items: 0 } }, 201);
  } catch (error) {
    return fail(error);
  }
}
