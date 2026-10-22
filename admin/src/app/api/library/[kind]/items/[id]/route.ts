import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { asKind, cleanName, itemDto, tables } from '@/lib/library';

import { readSvg, sizeFrom } from '@/lib/library-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ kind: string; id: string }> };

/** Edits name, category, size or status, and optionally replaces the SVG (sent as a form). */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const { kind: rawKind, id } = await ctx.params;
    const kind = asKind(rawKind);
    const t = tables(kind);
    const existing = await t.item.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'That item does not exist.');
    const form = await request.formData().catch(() => null);
    if (!form) throw new HttpError(400, 'Send the form.');

    const data: Record<string, unknown> = {};
    if (form.has('name')) {
      const name = cleanName(form.get('name'));
      if (!name) throw new HttpError(400, 'Give it a name.');
      data.name = name;
    }
    if (form.has('categoryId')) {
      const category = await t.category.findUnique({ where: { id: String(form.get('categoryId')) } });
      if (!category) throw new HttpError(400, 'Choose a category.');
      data.categoryId = category.id;
    }
    if (form.has('status')) data.status = ['published', 'disabled'].includes(String(form.get('status'))) ? String(form.get('status')) : 'draft';
    const clean = await readSvg(form.get('file'));
    if (clean) Object.assign(data, { svgCode: clean.svg, viewBox: clean.viewBox, contentHash: clean.hash });
    if (form.has('widthMm') || form.has('heightMm') || clean) {
      const size = sizeFrom(
        kind,
        form.has('widthMm') ? form.get('widthMm') : existing.widthMm,
        form.has('heightMm') ? form.get('heightMm') : existing.heightMm,
        clean,
      );
      Object.assign(data, size);
    }
    const saved = await t.item.update({ where: { id }, data });
    return json({ item: itemDto(saved), removed: clean?.removed ?? [] });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const { kind, id } = await ctx.params;
    const t = tables(asKind(kind));
    if (!(await t.item.findUnique({ where: { id } }))) throw new HttpError(404, 'That item does not exist.');
    await t.item.delete({ where: { id } });
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
