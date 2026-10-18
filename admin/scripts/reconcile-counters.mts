// Compares each user's printCountTotal with the sum of their stored print events.
//   npx tsx scripts/reconcile-counters.mts          report only (exit 1 when anything drifted)
//   npx tsx scripts/reconcile-counters.mts --fix    also rewrite the counters from the events
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
const prisma = new PrismaClient();
const fix = process.argv.includes('--fix');

const sums = await prisma.printEvent.groupBy({ by: ['userId'], where: { userId: { not: null } }, _sum: { labelsCount: true } });
const real = new Map(sums.map((row) => [row.userId as string, row._sum.labelsCount ?? 0]));
const users = await prisma.user.findMany({ select: { id: true, name: true, mobile: true, printCountTotal: true } });

const drift = users
  .map((u) => ({ ...u, expected: real.get(u.id) ?? 0 }))
  .filter((u) => u.printCountTotal !== u.expected);

console.log(`checked ${users.length} users, ${sums.length} with print events`);
if (drift.length === 0) console.log('no drift: every counter equals the sum of its events');
for (const u of drift) {
  console.log(`DRIFT ${u.name} (…${u.mobile.slice(-4)}): counter ${u.printCountTotal}, events say ${u.expected}`);
  if (fix) await prisma.user.update({ where: { id: u.id }, data: { printCountTotal: u.expected } });
}
if (fix && drift.length) console.log(`fixed ${drift.length} counter(s)`);
await prisma.$disconnect();
process.exit(drift.length && !fix ? 1 : 0);
