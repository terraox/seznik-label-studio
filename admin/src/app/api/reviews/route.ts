import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { read } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePermission('feedback.view');
    const reviews = await read((db) => db.reviews);
    return json({ reviews });
  } catch (error) {
    return fail(error);
  }
}
