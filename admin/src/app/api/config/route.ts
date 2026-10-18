import { audit } from '@/lib/audit';
import { readAppConfig } from '@/lib/app-config';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePermission('config.view');
    return json(await readAppConfig());
  } catch (error) {
    return fail(error);
  }
}

/** Owner-only: admin contact shown on the blocked screen, minimum build, legacy cutoff. */
export async function PUT(request: Request) {
  try {
    const admin = await requirePermission('config.edit');
    const body = (await request.json()) as {
      adminContact?: { email?: string | null; phone?: string | null; whatsapp?: string | null };
      minAppBuild?: number;
      legacyCutoff?: boolean;
    };
    const before = await readAppConfig();
    const set = (key: string, value: unknown) =>
      prisma.appConfig.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });
    if (body.adminContact) {
      const clean = (value?: string | null) => (value ?? '').trim().slice(0, 120) || null;
      await set('adminContact', {
        email: clean(body.adminContact.email),
        phone: clean(body.adminContact.phone),
        whatsapp: clean(body.adminContact.whatsapp),
      });
    }
    if (body.minAppBuild !== undefined) {
      if (!Number.isInteger(body.minAppBuild) || body.minAppBuild < 0) throw new HttpError(400, 'Minimum build must be a whole number.');
      await set('minAppBuild', body.minAppBuild);
    }
    if (typeof body.legacyCutoff === 'boolean') await set('legacyCutoff', body.legacyCutoff);
    const after = await readAppConfig();
    await audit(admin, 'config.update', 'config', 'app', before as never, after as never, request);
    return json(after);
  } catch (error) {
    return fail(error);
  }
}
