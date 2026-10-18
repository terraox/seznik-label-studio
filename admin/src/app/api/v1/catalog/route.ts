import { NextResponse } from 'next/server';

import { authenticateApp } from '@/lib/app-auth';
import { currentRevision, itemDto } from '@/lib/catalog/service';
import { corsPreflight, withCors } from '@/lib/cors';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOMBSTONE_KEEP_DAYS = 90;
const reply = (body: unknown, status = 200) => {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'private, no-store');
  return withCors(res);
};

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Catalogue for the app. `?since=<revision>` returns only what changed after that revision:
 * published items to add or replace, ids to remove (deleted or unpublished), and the full category list
 * (small). If the app is older than the deletion history we keep (90 days), `fullResync` is true and
 * the answer is everything. The app keeps working offline with what it already has.
 */
export async function GET(request: Request) {
  const auth = await authenticateApp(request);
  if (auth.error) return auth.error;

  const raw = Number(new URL(request.url).searchParams.get('since'));
  const since = Number.isInteger(raw) && raw > 0 ? raw : 0;

  // forget deletions older than the retention window and remember how far back we can still answer
  const cutoff = new Date(Date.now() - TOMBSTONE_KEEP_DAYS * 86_400_000);
  const old = await prisma.catalogTombstone.aggregate({ where: { deletedAt: { lt: cutoff } }, _max: { revision: true } });
  if (old._max.revision !== null) {
    await prisma.catalogTombstone.deleteMany({ where: { deletedAt: { lt: cutoff } } });
    const floorRow = await prisma.appConfig.findUnique({ where: { key: 'catalogTombstoneFloor' } });
    const floor = Math.max(old._max.revision, typeof floorRow?.value === 'number' ? floorRow.value : 0);
    await prisma.appConfig.upsert({ where: { key: 'catalogTombstoneFloor' }, update: { value: floor }, create: { key: 'catalogTombstoneFloor', value: floor } });
  }
  const floorRow = await prisma.appConfig.findUnique({ where: { key: 'catalogTombstoneFloor' } });
  const floor = typeof floorRow?.value === 'number' ? floorRow.value : 0;

  const fullResync = since === 0 || since < floor;
  const [revision, categories, items, removed, unpublished] = await Promise.all([
    currentRevision(),
    prisma.catalogCategory.findMany({ where: { deletedAt: null }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.catalogItem.findMany({
      where: { deletedAt: null, status: 'published', ...(fullResync ? {} : { revision: { gt: since } }) },
      orderBy: { revision: 'asc' },
    }),
    fullResync ? Promise.resolve([]) : prisma.catalogTombstone.findMany({ where: { revision: { gt: since } }, select: { itemId: true } }),
    fullResync ? Promise.resolve([]) : prisma.catalogItem.findMany({ where: { deletedAt: null, status: 'draft', revision: { gt: since } }, select: { id: true } }),
  ]);

  return reply({
    revision,
    fullResync,
    categories: categories.map((c) => ({ id: c.id, kind: c.kind, name: c.name, sortOrder: c.sortOrder })),
    items: items.map((i) => {
      const dto = itemDto(i);
      return {
        id: dto.id, kind: dto.kind, categoryId: dto.categoryId, name: dto.name, widthMm: dto.widthMm, heightMm: dto.heightMm,
        viewBox: dto.viewBox, version: dto.version, revision: dto.revision, contentHash: dto.contentHash,
        fileSizeBytes: dto.fileSizeBytes, svgUrl: dto.svgUrl, thumbUrl: dto.thumbUrl, updatedAt: dto.updatedAt,
      };
    }),
    deletedItemIds: [...new Set([...removed.map((r) => r.itemId), ...unpublished.map((u) => u.id)])],
  });
}
