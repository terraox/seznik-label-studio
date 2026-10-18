import { MAX_SVG_BYTES } from '@/lib/catalog/sanitize-svg';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A direct browser-to-bucket upload (S3 only): the answer carries the form fields to send with the
 * file. Local storage answers `{ direct: false }`; upload through POST /api/catalog/uploads instead.
 * Either way the file is cleaned again before it is published.
 */
export async function POST() {
  try {
    await requirePermission('catalog.edit');
    const upload = await storage().presignUpload({ contentType: 'image/svg+xml', maxBytes: MAX_SVG_BYTES, expiresInSeconds: 300 });
    return json(upload ? { direct: true, ...upload } : { direct: false });
  } catch (error) {
    return fail(error);
  }
}
