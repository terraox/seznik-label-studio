import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { toAdminUserDto } from '@/lib/user-dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Lets the user sign in again. Their old sessions stay invalid, so they log in once more. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('users.block');
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const note = (body.note ?? '').trim().slice(0, 1000) || null;

    const user = await prisma.$transaction(async (tx) => {
      const moved = await tx.user.updateMany({
        where: { id, status: 'blocked' },
        data: { status: 'active', blockedAt: null, blockedBy: null, blockMessage: null, blockInternalNote: null },
      });
      if (moved.count === 0) {
        const exists = await tx.user.findUnique({ where: { id }, select: { status: true } });
        if (!exists) throw new HttpError(404, 'That user does not exist.');
        throw new HttpError(409, 'That account is not blocked.');
      }
      const updated = await tx.user.findUniqueOrThrow({ where: { id } });
      await tx.registeredPhone.updateMany({
        where: { mobile: updated.mobile },
        data: { blocked: false, blockReason: null, blockedAt: null },
      });
      await tx.userStatusEvent.create({
        data: { userId: id, action: 'unblock', message: note, adminEmail: admin.email },
      });
      return updated;
    });
    return json({ user: toAdminUserDto(user) });
  } catch (error) {
    return fail(error);
  }
}
