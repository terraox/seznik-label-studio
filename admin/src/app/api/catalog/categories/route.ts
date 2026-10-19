import { asKind, nextRevision } from '@/lib/catalog/service';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requirePermission('catalog.view');
    const kind = asKind(new URL(request.url).searchParams.get('kind'));
    const cats = await prisma.catalogCategory.findMany({
      where: { deletedAt: null, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    return json({ categories: cats.map((c) => ({ id: c.id, kind: c.kind, name: c.name, sortOrder: c.sortOrder, items: c._count.items })) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePermission('catalog.edit');
    const body = (await request.json()) as { kind?: string; name?: string };
    const kind = asKind(body.kind);
    const name = (body.name ?? '').trim().slice(0, 60);
    if (!kind) throw new HttpError(400, 'Choose clipart or template.');
    if (!name) throw new HttpError(400, 'Give the category a name.');
    const clash = await prisma.catalogCategory.findFirst({ where: { kind, deletedAt: null, name: { equals: name, mode: 'insensitive' } } });
    if (clash) throw new HttpError(409, 'A category with that name already exists.');
    const last = await prisma.catalogCategory.aggregate({ where: { kind, deletedAt: null }, _max: { sortOrder: true } });
    const category = await prisma.catalogCategory.create({ data: { kind, name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    await prisma.$transaction((tx) => nextRevision(tx)); // lets the app notice the change on its next sync
    return json({ category: { id: category.id, kind, name, sortOrder: category.sortOrder, items: 0 } }, 201);
  } catch (error) {
    return fail(error);
  }
}
