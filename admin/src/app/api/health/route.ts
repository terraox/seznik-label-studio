import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness + database check for uptime monitors, the deploy script and the local CI script. Public: no details. */
export async function GET() {
  const uptimeSec = Math.round(process.uptime());
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: true, uptimeSec, time: new Date().toISOString() }, { headers });
  } catch {
    return Response.json({ ok: false, db: false, uptimeSec, time: new Date().toISOString() }, { status: 503, headers });
  }
}
