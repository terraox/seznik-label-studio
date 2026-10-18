import type { AdminAccount } from '@prisma/client';

import { normalizeRole } from './permissions';
import type { AdminRecord } from './types';

/** Database row -> the shape the desk code works with (role normalised, dates as text). */
export function toRecord(row: AdminAccount): AdminRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: normalizeRole(row.role),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    passwordHash: row.passwordHash,
    mustChangePassword: row.mustChangePassword,
    fixedCredentials: row.fixedCredentials,
    credsVersion: row.credsVersion,
    totpSecret: row.totpSecret ?? undefined,
    pendingTotpSecret: row.pendingTotpSecret ?? undefined,
    lastTotpStep: row.lastTotpStep ?? undefined,
  };
}
