import { toRecord } from '@/lib/admin-db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { can, ROLE_IDS, type Role } from '@/lib/permissions';
import { publicAdmin } from '@/lib/present';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function otherActiveSuperadmins(exceptId: string) {
  return prisma.adminAccount.count({ where: { role: 'superadmin', active: true, id: { not: exceptId } } });
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const actor = await requirePermission('overview.view');
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      name?: string;
      password?: string;
      currentPassword?: string;
      role?: Role;
      active?: boolean;
    };
    const row = await prisma.adminAccount.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'That person is not on the desk.');
    const current = toRecord(row);
    const self = actor.id === current.id;
    const manager = can(actor.role, 'admins.manage');
    if (!self && !manager) throw new HttpError(403, 'Only a super admin can change someone else.');

    const data: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (body.password) {
      if (body.password.length < 12) throw new HttpError(400, 'Use at least 12 characters for the password.');
      if (row.fixedCredentials) {
        throw new HttpError(400, 'This password is set in the server environment (ADMIN_FIXED_PASSWORD).');
      }
      if (self && !verifyPassword(body.currentPassword ?? '', current.passwordHash)) {
        throw new HttpError(400, 'Current password does not match.');
      }
      data.passwordHash = hashPassword(body.password);
      // A password someone else chose must be replaced at the next sign-in.
      data.mustChangePassword = !self;
    }
    if (body.role) {
      if (self) throw new HttpError(400, 'You cannot change your own role.');
      if (!manager) throw new HttpError(403, 'Only a super admin can change roles.');
      if (!(ROLE_IDS as readonly string[]).includes(body.role)) throw new HttpError(400, 'Pick a role.');
      if (current.role === 'superadmin' && body.role !== 'superadmin' && (await otherActiveSuperadmins(id)) === 0) {
        throw new HttpError(400, 'Keep at least one super admin.');
      }
      data.role = body.role;
    }
    if (typeof body.active === 'boolean') {
      if (self) throw new HttpError(400, 'You cannot disable your own sign-in.');
      if (!manager) throw new HttpError(403, 'Only a super admin can do that.');
      if (!body.active && current.role === 'superadmin' && (await otherActiveSuperadmins(id)) === 0) {
        throw new HttpError(400, 'Keep at least one super admin.');
      }
      data.active = body.active;
    }
    const saved = await prisma.adminAccount.update({ where: { id }, data });
    await audit(
      actor,
      'admin.update',
      'admin',
      id,
      { role: current.role, active: current.active },
      { role: saved.role, active: saved.active, passwordChanged: !!body.password },
      request,
    );
    return json({ admin: publicAdmin(toRecord(saved)) });
  } catch (error) {
    return fail(error);
  }
}
