import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUNDS = 7;

/**
 * Times the database from this server: one warm-up query (connection set-up, reported separately),
 * then ROUNDS tiny queries and one small real read. Network distance to the database is included.
 */
export async function GET() {
  try {
    await requirePermission('config.view');
    const time = async (run: () => Promise<unknown>) => {
      const start = performance.now();
      await run();
      return Math.round((performance.now() - start) * 10) / 10;
    };

    const warmUp = await time(() => prisma.$queryRaw`SELECT 1`);
    const samples: number[] = [];
    for (let i = 0; i < ROUNDS; i += 1) samples.push(await time(() => prisma.$queryRaw`SELECT 1`));
    const read = await time(() => prisma.user.count());

    const sorted = [...samples].sort((a, b) => a - b);
    const avg = Math.round((samples.reduce((n, x) => n + x, 0) / samples.length) * 10) / 10;
    return json({
      warmUpMs: warmUp,
      samples,
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
      avgMs: avg,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      readMs: read,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}
