import fs from 'fs/promises';
import os from 'os';

import { DATA_DIR } from '@/lib/files';
import { requirePermission } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { checkSecrets } from '@/lib/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MB = 1024 * 1024;

/** Host of the database only, never the user, password or database name. */
function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    return 'not set';
  }
}

async function dataDirCheck() {
  try {
    const probe = `${DATA_DIR}/.health-probe`;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(probe, String(Date.now()));
    await fs.rm(probe, { force: true });
    const stat = await fs.statfs(DATA_DIR);
    return { writable: true, freeMb: Math.round((stat.bavail * stat.bsize) / MB), totalMb: Math.round((stat.blocks * stat.bsize) / MB) };
  } catch {
    return { writable: false, freeMb: 0, totalMb: 0 };
  }
}

/** One server-side look at the backend for the Settings card. Read-only; values never include secrets. */
export async function GET() {
  try {
    await requirePermission('config.view');
    const started = performance.now();
    let dbOk = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }
    const dbMs = Math.round((performance.now() - started) * 10) / 10;
    const mem = process.memoryUsage();
    const data = await dataDirCheck();
    const secretProblems = checkSecrets();
    return json({
      ok: dbOk && data.writable && secretProblems.length === 0,
      checkedAt: new Date().toISOString(),
      server: {
        environment: process.env.NODE_ENV ?? 'unknown',
        node: process.version,
        uptimeSec: Math.round(process.uptime()),
        memoryUsedMb: Math.round(mem.rss / MB),
        memoryTotalMb: Math.round(os.totalmem() / MB),
        loadAvg1m: Math.round(os.loadavg()[0] * 100) / 100,
        cpus: os.cpus().length,
      },
      database: { ok: dbOk, host: databaseHost(), pingMs: dbMs },
      dataDisk: data,
      config: {
        secretsOk: secretProblems.length === 0,
        smsConfigured: Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID),
        apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'not set',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
