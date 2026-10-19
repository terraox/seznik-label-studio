import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePermission('analytics.view');
    const aliases = await prisma.printerAlias.findMany({ orderBy: { createdAt: 'desc' } });
    return json({ aliases });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Merge or rename printers: every printer whose raw name or normalised model equals `pattern`
 * (ignoring case) is shown as `model` from now on, including printers that connect later.
 */
export async function POST(request: Request) {
  try {
    const admin = await requirePermission('printers.edit');
    const body = (await request.json()) as { pattern?: string; model?: string };
    const pattern = (body.pattern ?? '').trim().slice(0, 120);
    const model = (body.model ?? '').trim().slice(0, 120);
    if (!pattern || !model) throw new HttpError(400, 'Give the printer name to match and the name to show.');
    const taken = await prisma.printerAlias.findFirst({ where: { pattern: { equals: pattern, mode: 'insensitive' } } });
    if (taken) throw new HttpError(409, 'That printer name already has a rule.');
    const [alias, moved] = await prisma.$transaction(async (tx) => {
      const created = await tx.printerAlias.create({ data: { pattern, displayName: model, modelNormalised: model } });
      const result = await tx.printer.updateMany({
        where: { OR: [{ nameRaw: { equals: pattern, mode: 'insensitive' } }, { modelNormalised: { equals: pattern, mode: 'insensitive' } }] },
        data: { modelNormalised: model },
      });
      return [created, result.count] as const;
    });
    return json({ alias, printersChanged: moved }, 201);
  } catch (error) {
    return fail(error);
  }
}
