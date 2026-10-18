import type { Prisma } from '@prisma/client';

import { prisma } from './prisma';
import type { AdminRecord } from './types';

/** Writes one row of the admin audit trail. Call it for every admin write and every export. */
export async function audit(
  admin: Pick<AdminRecord, 'id' | 'email'>,
  action: string,
  targetType: string,
  targetId: string,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
  request?: Request,
) {
  const ip = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  await prisma.adminAuditLog.create({
    data: { adminId: admin.id, adminEmail: admin.email, action, targetType, targetId, before, after, ip },
  });
}
