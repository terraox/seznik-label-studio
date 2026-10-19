import { prisma } from './prisma';

/** Facts every analytics screen shows underneath its numbers. */
export async function footerInfo() {
  const [firstPrint, firstConn, versions] = await Promise.all([
    prisma.printEvent.aggregate({ _min: { receivedAt: true } }),
    prisma.printerConnection.aggregate({ _min: { receivedAt: true } }),
    prisma.user.groupBy({ by: ['appVersion'], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const firsts = [firstPrint._min.receivedAt, firstConn._min.receivedAt].filter((d): d is Date => !!d);
  const total = versions.reduce((sum, v) => sum + v._count._all, 0);
  return {
    trackingSince: firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))).toISOString() : null,
    countedAs: 'Labels sent to a connected printer (confirmed hand-off to the printer, not paper physically printed).',
    appVersions: versions
      .map((v) => ({ version: v.appVersion ?? 'Older build', users: v._count._all, percent: total ? Math.round((v._count._all / total) * 100) : 0 }))
      .sort((a, b) => b.users - a.users),
  };
}
