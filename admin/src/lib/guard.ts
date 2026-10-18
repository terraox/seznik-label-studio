import { cookies } from 'next/headers';
import { COOKIE } from './constants';
import { toRecord } from './admin-db';
import { HttpError } from './http';
import { can, type Permission } from './permissions';
import { prisma } from './prisma';
import { verifySession } from './session';
import type { AdminRecord } from './types';

/** The signed-in admin, or 401. Stops with 403 when their role lacks `permission`. */
export async function requirePermission(permission: Permission): Promise<AdminRecord> {
  const jar = await cookies();
  const session = await verifySession(jar.get(COOKIE)?.value);
  if (!session || session.scope) throw new HttpError(401, 'Sign in to continue.');
  const row = await prisma.adminAccount.findUnique({ where: { id: session.id } });
  if (!row || !row.active) throw new HttpError(401, 'Sign in to continue.');
  const admin = toRecord(row);
  if (!can(admin.role, permission)) throw new HttpError(403, 'You do not have access to that.');
  return admin;
}
