import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { asKind, itemDto, tables } from '@/lib/library';
import { Prisma } from '@prisma/client';

import { cleanSampleLayout } from '@/lib/sample-layout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ kind: string; id: string }> };

/** Saves the sample content the admin designed for a template. `{ layout: [...] }`; an empty list clears it. */
export async function PUT(request: Request, ctx: Ctx) {
  try {
    await requirePermission('catalog.edit');
    const { kind: rawKind, id } = await ctx.params;
    if (asKind(rawKind) !== 'template') throw new HttpError(404, 'Only templates have sample content.');
    const t = tables('template');
    const existing = await t.item.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'That template does not exist.');
    const body = (await request.json().catch(() => null)) as { layout?: unknown } | null;
    const checked = cleanSampleLayout(body?.layout, existing.widthMm, existing.heightMm);
    if (!checked.ok) throw new HttpError(400, checked.error);
    const saved = await t.item.update({
      where: { id },
      // Prisma needs the explicit null marker to clear a Json column.
      data: { sampleLayout: checked.layout.length ? checked.layout : Prisma.DbNull },
    });
    return json({ item: itemDto(saved) });
  } catch (error) {
    return fail(error);
  }
}
