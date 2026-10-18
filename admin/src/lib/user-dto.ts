import type { User } from '@prisma/client';
import { maskMobile } from './phone';
import { printerDisplayName } from './printers';

export function toUserDto(user: User) {
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    printerId: user.printerName,
    printerName: printerDisplayName(user.printerName),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

/** What the admin desk sees. Never includes the password hash. `maskPhone` hides the number for roles without phone access. */
export function toAdminUserDto(user: User, maskPhone = false) {
  return {
    id: user.id,
    name: user.name,
    mobile: maskPhone ? maskMobile(user.mobile) : user.mobile,
    printerId: user.printerName,
    printerName: printerDisplayName(user.printerName),
    status: user.status,
    blockedAt: user.blockedAt?.toISOString() ?? null,
    blockedBy: user.blockedBy,
    blockMessage: user.blockMessage,
    blockInternalNote: user.blockInternalNote,
    printCountTotal: user.printCountTotal,
    lastPrintAt: user.lastPrintAt?.toISOString() ?? null,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    appVersion: user.appVersion,
    platform: user.platform,
    deviceModel: user.deviceModel,
    isInternal: user.isInternal,
    passwordUpdatedAt: user.passwordUpdatedAt?.toISOString() ?? null,
    passwordSet: true,
  };
}

export type AdminUserDto = ReturnType<typeof toAdminUserDto>;
