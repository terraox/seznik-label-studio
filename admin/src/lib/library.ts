import { HttpError } from './http';
import { prisma } from './prisma';

/** Templates and clipart are two separate sets of tables that behave the same way. */
export type LibraryKind = 'template' | 'clipart';

export function asKind(value: string): LibraryKind {
  if (value === 'template' || value === 'clipart') return value;
  throw new HttpError(404, 'Not found.');
}

// Both tables share the same columns the handlers touch, so one loosely typed handle serves either.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Delegate = {
  findMany(args?: any): Promise<any[]>;
  findFirst(args?: any): Promise<any | null>;
  findUnique(args?: any): Promise<any | null>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<any>;
  delete(args: any): Promise<any>;
  count(args?: any): Promise<number>;
  aggregate(args: any): Promise<any>;
};

export function tables(kind: LibraryKind): { category: Delegate; item: Delegate; itemRelation: 'templates' | 'clipart' } {
  return kind === 'template'
    ? { category: prisma.templateCategory as unknown as Delegate, item: prisma.template as unknown as Delegate, itemRelation: 'templates' }
    : { category: prisma.clipartCategory as unknown as Delegate, item: prisma.clipart as unknown as Delegate, itemRelation: 'clipart' };
}

/** Load an item with this so itemDto can list its categories. */
export const withCategories = { categories: { select: { categoryId: true } } } as const;

/** Keeps only ids of categories that exist, for a form field holding a JSON list of category ids. */
export async function pickCategories(t: ReturnType<typeof tables>, raw: FormDataEntryValue | null): Promise<string[]> {
  let wanted: unknown;
  try { wanted = JSON.parse(String(raw ?? '[]')); } catch { throw new HttpError(400, 'Categories were not sent as a list.'); }
  if (!Array.isArray(wanted)) throw new HttpError(400, 'Categories were not sent as a list.');
  const ids = [...new Set(wanted.map(String))];
  if (!ids.length) return [];
  const found = await t.category.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) throw new HttpError(400, 'One of those categories no longer exists. Refresh and try again.');
  return ids;
}

export const cleanName = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);

export function itemDto(item: any) {
  return {
    id: item.id as string,
    name: item.name as string,
    categoryIds: ((item.categories ?? []) as { categoryId: string }[]).map((l) => l.categoryId),
    widthMm: (item.widthMm ?? null) as number | null,
    heightMm: (item.heightMm ?? null) as number | null,
    viewBox: (item.viewBox ?? null) as string | null,
    status: item.status as 'draft' | 'published' | 'disabled',
    contentHash: item.contentHash as string,
    sampleLayout: (item.sampleLayout ?? null) as unknown,
    svgCode: item.svgCode as string,
    createdAt: (item.createdAt as Date).toISOString(),
    updatedAt: (item.updatedAt as Date).toISOString(),
  };
}
