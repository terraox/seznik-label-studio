import { requirePermission } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { toAdminUserDto } from '@/lib/user-dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Signs the user out everywhere without blocking them. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('users.block');
    const { id } = await ctx.params;
    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, 'That user does not exist.');
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
      await tx.userStatusEvent.create({ data: { userId: id, action: 'force_logout', adminEmail: admin.email } });
      return updated;
    });
    await audit(admin, 'user.force_logout', 'user', id, undefined, { tokenVersion: user.tokenVersion }, request);
    return json({ user: toAdminUserDto(user) });
  } catch (error) {
    return fail(error);
  }
}
