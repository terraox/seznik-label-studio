import { requirePermission } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { fail, HttpError, json } from '@/lib/http';
import { normalizeMobile } from '@/lib/phone';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Numbers that cannot sign up or sign in (blocked accounts and pre-blocked numbers). */
export async function GET() {
  try {
    await requirePermission('users.phones');
    const rows = await prisma.registeredPhone.findMany({
      where: { blocked: true },
      orderBy: { blockedAt: 'desc' },
      take: 200,
    });
    return json({
      phones: rows.map((row) => ({
        mobile: row.mobile,
        hasAccount: !!row.userId,
        reason: row.blockReason,
        blockedAt: row.blockedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

/** Block a number before it ever registers, or lift a block on a number with no account. */
export async function POST(request: Request) {
  try {
    const admin = await requirePermission('users.block');
    const body = (await request.json()) as { mobile?: string; blocked?: boolean; reason?: string };
    const mobile = normalizeMobile(body.mobile);
    if (!mobile) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
    const blocked = body.blocked !== false;
    const reason = (body.reason ?? '').trim().slice(0, 300) || null;
    const existing = await prisma.registeredPhone.findUnique({ where: { mobile } });
    if (existing?.userId) {
      throw new HttpError(409, 'That number has an account. Block or unblock the user instead.');
    }
    if (!blocked && !existing) throw new HttpError(404, 'That number is not blocked.');
    if (blocked) {
      await prisma.registeredPhone.upsert({
        where: { mobile },
        update: { blocked: true, blockReason: reason, blockedAt: new Date() },
        create: { mobile, blocked: true, blockReason: reason, blockedAt: new Date() },
      });
    } else {
      await prisma.registeredPhone.delete({ where: { mobile } });
    }
    await audit(admin, blocked ? 'phone.block' : 'phone.unblock', 'phone', mobile, undefined, { blocked, reason }, request);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
