import { randomUUID } from 'crypto';
import type { CatalogItem, Prisma } from '@prisma/client';

import { HttpError } from '../http';
import { prisma } from '../prisma';
import { storage } from '../storage';
import { sanitizeSvg, type SanitizeSuccess } from './sanitize-svg';
import { renderThumbnail } from './thumbnail';

export type CatalogKind = 'clipart' | 'template';
export const KINDS: readonly CatalogKind[] = ['clipart', 'template'];
export const asKind = (v: unknown): CatalogKind | null => (KINDS as readonly string[]).includes(String(v)) ? (v as CatalogKind) : null;

type Tx = Prisma.TransactionClient;

/** Next catalogue-wide revision (the delta-sync counter). Atomic, works on any database. */
export async function nextRevision(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<{ rev: number }[]>`
    INSERT INTO "AppConfig" ("key", "value", "updatedAt") VALUES ('catalogRevision', '1'::jsonb, now())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = to_jsonb(("AppConfig"."value" #>> '{}')::int + 1), "updatedAt" = now()
    RETURNING ("value" #>> '{}')::int AS rev`;
  return rows[0].rev;
}

export async function currentRevision(): Promise<number> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'catalogRevision' } });
  return typeof row?.value === 'number' ? row.value : 0;
}

export function itemDto(item: CatalogItem) {
  const store = storage();
  return {
    id: item.id,
    kind: item.kind,
    categoryId: item.categoryId,
    name: item.name,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    viewBox: item.viewBox,
    version: item.version,
    status: item.status,
    revision: item.revision,
    contentHash: item.contentHash,
    fileSizeBytes: item.fileSizeBytes,
    svgUrl: store.publicUrl(item.svgKey),
    thumbUrl: item.thumbKey ? store.publicUrl(item.thumbKey) : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export const stagingKey = () => `staging/${randomUUID()}.svg`;
export const isStagingKey = (k: unknown): k is string => typeof k === 'string' && /^staging\/[0-9a-f-]{36}\.svg$/.test(k);

/** Reads a waiting upload and cleans it again (the browser-to-S3 route stores the raw file). */
export async function loadStaged(key: unknown): Promise<SanitizeSuccess> {
  if (!isStagingKey(key)) throw new HttpError(400, 'That upload reference is not valid.');
  const file = await storage().get(key);
  if (!file) throw new HttpError(404, 'That upload has expired. Upload the file again.');
  const result = sanitizeSvg(file.body);
  if (!result.ok) throw new HttpError(400, result.message);
  return result;
}

/** Writes the cleaned SVG and its PNG preview under the published key (hash in the name = cacheable forever). */
export async function publishFiles(kind: CatalogKind, itemId: string, clean: SanitizeSuccess) {
  const store = storage();
  const base = `catalog/${kind}/${itemId}/${clean.hash}`;
  await store.put(`${base}.svg`, Buffer.from(clean.svg, 'utf8'), { contentType: 'image/svg+xml' });
  const png = await renderThumbnail(clean.svg);
  if (png) await store.put(`${base}.png`, png, { contentType: 'image/png' });
  return { svgKey: `${base}.svg`, thumbKey: png ? `${base}.png` : null };
}

export const cleanName = (v: unknown, fallback = '') => String(v ?? fallback).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
