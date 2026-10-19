import type { Prisma } from '@prisma/client';

import { cleanName, asKind, itemDto, loadStaged, nextRevision, publishFiles } from '@/lib/catalog/service';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requirePermission('catalog.view');
    const url = new URL(request.url);
    const kind = asKind(url.searchParams.get('kind'));
    const categoryId = url.searchParams.get('categoryId');
    const status = url.searchParams.get('status');
    const q = (url.searchParams.get('q') ?? '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 48));
    const where: Prisma.CatalogItemWhereInput = {
      deletedAt: null,
      ...(kind ? { kind } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(status === 'draft' || status === 'published' ? { status } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.catalogItem.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.catalogItem.count({ where }),
    ]);
    return json({ items: items.map(itemDto), total, page, pageSize });
  } catch (error) {
    return fail(error);
  }
}

/** Publishes (or saves as a draft) an upload that is waiting in staging. */
export async function POST(request: Request) {
  try {
    const admin = await requirePermission('catalog.edit');
    const body = (await request.json()) as {
      stagingKey?: string; name?: string; categoryId?: string; kind?: string;
      widthMm?: number; heightMm?: number; status?: string;
    };
    const kind = asKind(body.kind);
    const name = cleanName(body.name);
    if (!kind) throw new HttpError(400, 'Choose clipart or template.');
    if (!name) throw new HttpError(400, 'Give the item a name.');
    const status = body.status === 'published' ? 'published' : 'draft';
    const category = body.categoryId ? await prisma.catalogCategory.findFirst({ where: { id: body.categoryId, deletedAt: null } }) : null;
    if (!category) throw new HttpError(400, 'Choose a category.');
    if (category.kind !== kind) throw new HttpError(400, `That category is for ${category.kind}, not ${kind}.`);

    const clean = await loadStaged(body.stagingKey);
    const widthMm = Number.isFinite(body.widthMm) ? Number(body.widthMm) : clean.widthMm;
    const heightMm = Number.isFinite(body.heightMm) ? Number(body.heightMm) : clean.heightMm;
    if (kind === 'template' && !(widthMm && heightMm && widthMm > 0 && heightMm > 0 && widthMm <= 1000 && heightMm <= 1000)) {
      throw new HttpError(400, 'A template needs a label size (width and height in mm).');
    }

    const created = await prisma.$transaction(async (tx) => {
      const id = (await tx.catalogItem.create({
        data: {
          kind, categoryId: category.id, name, svgKey: 'pending', widthMm: widthMm ?? null, heightMm: heightMm ?? null,
          viewBox: clean.viewBox, fileSizeBytes: clean.bytes, contentHash: clean.hash, status,
          revision: await nextRevision(tx), createdBy: admin.email,
        },
      })).id;
      const keys = await publishFiles(kind, id, clean);
      return tx.catalogItem.update({ where: { id }, data: keys });
    });
    await storage().delete(body.stagingKey!).catch(() => {});
    const sameName = await prisma.catalogItem.count({ where: { categoryId: category.id, deletedAt: null, id: { not: created.id }, name: { equals: name, mode: 'insensitive' } } });
    return json({ item: itemDto(created), warnings: sameName ? ['Another item in this category has the same name.'] : [] }, 201);
  } catch (error) {
    return fail(error);
  }
}
