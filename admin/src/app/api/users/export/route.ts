import { requirePermission } from '@/lib/guard';
import { csvSafe } from '@/lib/format';
import { fail } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Owner-only CSV of users. Never includes password data. Every export is audited. */
export async function GET(request: Request) {
  try {
    const admin = await requirePermission('users.export');
    const users = await prisma.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
    const head = ['Name', 'Mobile', 'Printer', 'Status', 'Labels printed', 'Joined', 'Last seen', 'Last login', 'App version', 'Platform', 'Internal'];
    const lines = [head.join(',')];
    for (const u of users) {
      lines.push(
        [
          u.name, u.mobile, u.printerName ?? '', u.status, u.printCountTotal,
          u.createdAt.toISOString(), u.lastSeenAt?.toISOString() ?? '', u.lastLoginAt?.toISOString() ?? '',
          u.appVersion ?? '', u.platform ?? '', u.isInternal ? 'yes' : 'no',
        ].map(csvSafe).join(','),
      );
    }
    return new Response(`﻿${lines.join('\n')}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sez-print-users.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
