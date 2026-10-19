import { MAX_SVG_BYTES, sanitizeSvg } from '@/lib/catalog/sanitize-svg';
import { stagingKey } from '@/lib/catalog/service';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILES = 20;

/**
 * Upload one or more SVG files (multipart field "files"). Each file is cleaned and checked; the
 * cleaned copy waits in staging and the answer says what was removed, what the app will ignore,
 * the detected size, and whether the same picture is already in the library. Nothing is published yet.
 */
export async function POST(request: Request) {
  try {
    const admin = await requirePermission('catalog.edit');
    const form = await request.formData().catch(() => null);
    const files = (form?.getAll('files') ?? []).filter((f): f is File => typeof f !== 'string');
    if (files.length === 0) throw new HttpError(400, 'Choose at least one SVG file.');
    if (files.length > MAX_FILES) throw new HttpError(400, `Upload at most ${MAX_FILES} files at a time.`);

    const results = [];
    for (const file of files) {
      if (file.size > MAX_SVG_BYTES) {
        results.push({ fileName: file.name, ok: false as const, code: 'TOO_LARGE', message: `The file is larger than ${MAX_SVG_BYTES / 1024} KB.` });
        continue;
      }
      if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
        results.push({ fileName: file.name, ok: false as const, code: 'NOT_SVG', message: 'Only .svg files are accepted.' });
        continue;
      }
      const clean = sanitizeSvg(Buffer.from(await file.arrayBuffer()));
      if (!clean.ok) {
        results.push({ fileName: file.name, ok: false as const, code: clean.code, message: clean.message });
        continue;
      }
      const key = stagingKey();
      await storage().put(key, Buffer.from(clean.svg, 'utf8'), { contentType: 'image/svg+xml' });
      const twin = await prisma.catalogItem.findFirst({ where: { contentHash: clean.hash, deletedAt: null }, select: { id: true, name: true } });
      results.push({
        fileName: file.name,
        ok: true as const,
        stagingKey: key,
        suggestedName: file.name.replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 80),
        previewUrl: storage().publicUrl(key),
        bytes: clean.bytes,
        hash: clean.hash,
        viewBox: clean.viewBox,
        widthMm: clean.widthMm,
        heightMm: clean.heightMm,
        removed: clean.removed,
        warnings: clean.warnings,
        unsupportedForApp: clean.unsupportedForApp,
        drawOps: clean.drawOps,
        duplicateOf: twin,
      });
    }
    return json({ results });
  } catch (error) {
    return fail(error);
  }
}
