import { NextResponse } from 'next/server';

import { authenticateApp } from './app-auth';
import { withCors } from './cors';
import { tables, withCategories, type LibraryKind } from './library';

/**
 * What the app downloads: the categories plus every published item. `?since=<ISO time>` returns only
 * items changed after that time; `ids` always lists every published id, so the app can drop the rest.
 */
export async function appLibrary(request: Request, kind: LibraryKind) {
  const auth = await authenticateApp(request);
  if (auth.error) return auth.error;
  const t = tables(kind);
  const sinceRaw = new URL(request.url).searchParams.get('since');
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const where = { status: 'published', ...(since && !Number.isNaN(since.getTime()) ? { updatedAt: { gt: since } } : {}) };
  const [categories, items, ids] = await Promise.all([
    t.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    t.item.findMany({ where, include: withCategories, orderBy: { updatedAt: 'asc' } }),
    t.item.findMany({ where: { status: 'published' }, select: { id: true } }),
  ]);
  const res = NextResponse.json({
    serverTime: new Date().toISOString(),
    categories,
    ids: ids.map((i) => i.id),
    items: items.map((i) => ({
      // categoryId (the first one, or null) is kept for app builds from before multi-category.
      id: i.id, name: i.name, categoryIds: i.categories.map((l: { categoryId: string }) => l.categoryId),
      categoryId: i.categories[0]?.categoryId ?? null, widthMm: i.widthMm ?? null, heightMm: i.heightMm ?? null,
      viewBox: i.viewBox ?? null, sampleLayout: i.sampleLayout ?? null, contentHash: i.contentHash, updatedAt: (i.updatedAt as Date).toISOString(), svgCode: i.svgCode,
    })),
  });
  res.headers.set('Cache-Control', 'private, no-store');
  return withCors(res);
}
