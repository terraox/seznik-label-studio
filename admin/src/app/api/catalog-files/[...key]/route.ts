import { requirePermission } from '@/lib/guard';
import { fail, HttpError } from '@/lib/http';
import { assertSafeKey, contentTypeFor, storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ key: string[] }> };

/**
 * Serves catalogue files in development. Published files (`catalog/...`) are public and cacheable
 * forever (the file hash is in the key). Waiting uploads (`staging/...`) need an admin session.
 * The same safety headers CloudFront will add in production are set here.
 */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { key: parts } = await ctx.params;
    let key: string;
    try {
      key = assertSafeKey(parts.join('/'));
    } catch {
      throw new HttpError(404, 'Not found.');
    }
    const staging = key.startsWith('staging/');
    if (staging) await requirePermission('catalog.view');
    const file = await storage().get(key);
    if (!file) throw new HttpError(404, 'Not found.');
    const body = new Uint8Array(file.body);
    return new Response(body, {
      headers: {
        'Content-Type': contentTypeFor(key),
        'Content-Length': String(body.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': staging ? 'no-store' : 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
