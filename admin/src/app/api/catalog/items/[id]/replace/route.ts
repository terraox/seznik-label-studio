import { audit } from '@/lib/audit';
import { itemDto, loadStaged, nextRevision, publishFiles } from '@/lib/catalog/service';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Swaps the picture for a new upload: version + 1, new hashed address, old file kept (labels that embedded it are unaffected). */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('catalog.edit');
    const { id } = await ctx.params;
    const body = (await request.json()) as { stagingKey?: string };
    const item = await prisma.catalogItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new HttpError(404, 'That item does not exist.');
    const match = request.headers.get('if-match');
    if (match !== null && Number(match) !== item.revision) throw new HttpError(412, 'Someone else changed this item. Reload and try again.');
    const clean = await loadStaged(body.stagingKey);
    if (clean.hash === item.contentHash) throw new HttpError(409, 'That is the same picture that is already there.');
    const keys = await publishFiles(item.kind as 'clipart' | 'template', id, clean);
    const saved = await prisma.$transaction(async (tx) =>
      tx.catalogItem.update({
        where: { id },
        data: {
          ...keys,
          contentHash: clean.hash,
          fileSizeBytes: clean.bytes,
          viewBox: clean.viewBox,
          version: { increment: 1 },
          revision: await nextRevision(tx),
          ...(item.kind === 'template' ? {} : { widthMm: clean.widthMm, heightMm: clean.heightMm }),
        },
      }),
    );
    await storage().delete(body.stagingKey!).catch(() => {});
    await audit(admin, 'catalog.item.replace', 'catalog_item', id, { hash: item.contentHash, version: item.version }, { hash: clean.hash, version: saved.version }, request);
    return json({ item: itemDto(saved) });
  } catch (error) {
    return fail(error);
  }
}
