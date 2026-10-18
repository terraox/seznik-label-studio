import type { User } from '@prisma/client';
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
