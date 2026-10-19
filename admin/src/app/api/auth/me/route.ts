import { fail, json } from '@/lib/http';
import { requirePermission } from '@/lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return json(await requirePermission('overview.view'));
  } catch (error) {
    return fail(error);
  }
}
