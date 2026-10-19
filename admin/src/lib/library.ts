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
  delete(args: any): Promise<any>;
  count(args?: any): Promise<number>;
  aggregate(args: any): Promise<any>;
};

export function tables(kind: LibraryKind): { category: Delegate; item: Delegate; itemRelation: 'templates' | 'clipart' } {
  return kind === 'template'
    ? { category: prisma.templateCategory as unknown as Delegate, item: prisma.template as unknown as Delegate, itemRelation: 'templates' }
    : { category: prisma.clipartCategory as unknown as Delegate, item: prisma.clipart as unknown as Delegate, itemRelation: 'clipart' };
}

export const cleanName = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);

export function itemDto(item: any) {
  return {
    id: item.id as string,
    name: item.name as string,
    categoryId: item.categoryId as string,
    widthMm: (item.widthMm ?? null) as number | null,
    heightMm: (item.heightMm ?? null) as number | null,
    viewBox: (item.viewBox ?? null) as string | null,
    status: item.status as 'draft' | 'published',
    contentHash: item.contentHash as string,
    svgCode: item.svgCode as string,
    createdAt: (item.createdAt as Date).toISOString(),
    updatedAt: (item.updatedAt as Date).toISOString(),
  };
}
