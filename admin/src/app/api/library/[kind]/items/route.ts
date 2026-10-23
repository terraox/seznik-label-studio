import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { asKind, cleanName, itemDto, pickCategories, tables, withCategories } from '@/lib/library';
import { readSvg, sizeFrom } from '@/lib/library-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ kind: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.view');
    const t = tables(asKind((await ctx.params).kind));
    const url = new URL(request.url);
    const categoryId = url.searchParams.get('categoryId');
    const status = url.searchParams.get('status');
    const q = (url.searchParams.get('q') ?? '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 48));
    const where = {
      ...(categoryId ? { categories: { some: { categoryId } } } : {}),
      ...(status === 'draft' || status === 'published' || status === 'disabled' ? { status } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      t.item.findMany({ where, include: withCategories, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      t.item.count({ where }),
    ]);
    return json({ items: items.map(itemDto), total, page, pageSize });
  } catch (error) {
    return fail(error);
  }
}

/** Adds one template or clipart: name, categories (JSON list, may be empty) and the SVG file, sent as a form. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const kind = asKind((await ctx.params).kind);
    const t = tables(kind);
    const form = await request.formData().catch(() => null);
    if (!form) throw new HttpError(400, 'Send the form with the SVG file.');
    const name = cleanName(form.get('name'));
    if (!name) throw new HttpError(400, 'Give it a name.');
    const categoryIds = await pickCategories(t, form.get('categoryIds'));
    const clean = await readSvg(form.get('file'), kind);
    if (!clean) throw new HttpError(400, 'Choose an SVG file.');
    const { widthMm, heightMm } = sizeFrom(kind, form.get('widthMm'), form.get('heightMm'), clean);
    const created = await t.item.create({
      data: {
        name, svgCode: clean.svg, widthMm, heightMm, viewBox: clean.viewBox,
        contentHash: clean.hash, status: form.get('status') === 'published' ? 'published' : 'draft',
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
      include: withCategories,
    });
    return json({ item: itemDto(created), removed: clean.removed, warnings: [...clean.warnings, ...clean.unsupportedForApp.map((u) => `The app will ignore: ${u}`)] }, 201);
  } catch (error) {
    return fail(error);
  }
}
