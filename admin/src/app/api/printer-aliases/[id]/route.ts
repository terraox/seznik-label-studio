import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { normalizePrinterName } from '@/lib/printer-registry';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Removes a rule and puts the printers it changed back to their automatic model name. */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('printers.edit');
    const { id } = await ctx.params;
    const alias = await prisma.printerAlias.findUnique({ where: { id } });
    if (!alias) throw new HttpError(404, 'That rule does not exist.');
    let reverted = 0;
    await prisma.$transaction(async (tx) => {
      await tx.printerAlias.delete({ where: { id } });
      const affected = await tx.printer.findMany({ where: { modelNormalised: { equals: alias.modelNormalised, mode: 'insensitive' } } });
      for (const printer of affected) {
        const automatic = normalizePrinterName(printer.nameRaw);
        // Keep printers that another rule still covers.
        const other = await tx.printerAlias.findFirst({
          where: { OR: [{ pattern: { equals: printer.nameRaw, mode: 'insensitive' } }, { pattern: { equals: automatic, mode: 'insensitive' } }] },
        });
        const next = other?.modelNormalised ?? automatic;
        if (next !== printer.modelNormalised) {
          await tx.printer.update({ where: { id: printer.id }, data: { modelNormalised: next } });
          reverted += 1;
        }
      }
    });
    return json({ ok: true, printersReverted: reverted });
  } catch (error) {
    return fail(error);
  }
}
