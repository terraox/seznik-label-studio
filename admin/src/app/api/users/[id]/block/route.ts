import { requirePermission } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { fail, HttpError, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { toAdminUserDto } from '@/lib/user-dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Blocks the account, signs every device out (tokenVersion + 1) and keeps the number blocked. */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const admin = await requirePermission('users.block');
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { message?: string; internalNote?: string };
    const message = (body.message ?? '').trim().slice(0, 300) || null;
    const internalNote = (body.internalNote ?? '').trim().slice(0, 1000) || null;

    const user = await prisma.$transaction(async (tx) => {
      const moved = await tx.user.updateMany({
        where: { id, status: 'active' },
        data: {
          status: 'blocked',
          blockedAt: new Date(),
          blockedBy: admin.email,
          blockMessage: message,
          blockInternalNote: internalNote,
        },
      });
      if (moved.count === 0) {
        const exists = await tx.user.findUnique({ where: { id }, select: { status: true } });
        if (!exists) throw new HttpError(404, 'That user does not exist.');
        throw new HttpError(409, 'That account is already blocked.');
      }
      const updated = await tx.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
      await tx.registeredPhone.upsert({
        where: { mobile: updated.mobile },
        update: { blocked: true, blockReason: message, blockedAt: new Date() },
        create: { mobile: updated.mobile, userId: id, blocked: true, blockReason: message, blockedAt: new Date() },
      });
      await tx.userStatusEvent.create({
        data: { userId: id, action: 'block', message, internalNote, adminEmail: admin.email },
      });
      return updated;
    });
    await audit(admin, 'user.block', 'user', id, { status: 'active' }, { status: 'blocked', message, internalNote }, request);
    return json({ user: toAdminUserDto(user) });
  } catch (error) {
    return fail(error);
  }
}
