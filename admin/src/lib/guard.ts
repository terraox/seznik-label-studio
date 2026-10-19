import { cookies } from 'next/headers';
import { COOKIE } from './constants';
import { HttpError } from './http';
import type { Permission } from './permissions';
import { verifySession } from './session';
import type { Admin } from './types';

/** The one admin. Their sign-in comes from ADMIN_FIXED_USERNAME / ADMIN_FIXED_PASSWORD in the environment. */
export function ownerAdmin(): Admin {
  return {
    id: 'owner',
    name: 'Admin',
    email: (process.env.ADMIN_FIXED_USERNAME ?? '').trim().toLowerCase(),
    role: 'superadmin',
    active: true,
    createdAt: new Date(0).toISOString(),
  };
}

/** The signed-in admin, or 401. With a single admin every permission is granted. */
export async function requirePermission(_permission: Permission): Promise<Admin> {
  const jar = await cookies();
  const session = await verifySession(jar.get(COOKIE)?.value);
  if (!session) throw new HttpError(401, 'Sign in to continue.');
  return ownerAdmin();
}
