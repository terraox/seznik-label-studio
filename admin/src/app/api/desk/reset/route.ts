import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { resetSample } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requirePermission('desk.reset');
    if (process.env.NODE_ENV === 'production') throw new HttpError(403, 'Sample data is not used in production.');
    await resetSample();
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
