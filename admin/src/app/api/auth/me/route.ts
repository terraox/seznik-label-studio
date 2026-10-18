import { fail, json } from '@/lib/http';
import { publicAdmin } from '@/lib/present';
import { requirePermission } from '@/lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requirePermission('overview.view');
    return json(publicAdmin(admin));
  } catch (error) {
    return fail(error);
  }
}
