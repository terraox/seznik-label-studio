import { NextResponse } from 'next/server';

import { authenticateApp } from '@/lib/app-auth';
import { corsPreflight, withCors } from '@/lib/cors';
import { MAX_BATCH, processEvents } from '@/lib/events';
import { hit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 256 * 1024;
const reply = (body: unknown, status: number) => withCors(NextResponse.json(body, { status }));

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Batch of app events: { sentAt, events: [{ type, eventId, occurredAt, ... }] }, up to 50.
 * Answers 200 with a result per event (accepted / duplicate / rejected + reason) so the app knows
 * exactly which to drop and which to retry. A batch whose only problem is a missing printer is a 400.
 */
export async function POST(request: Request) {
  const auth = await authenticateApp(request);
  if (auth.error) return auth.error;

  const limit = await hit(`events:${auth.user.id}`, 120, 60_000);
  if (!limit.allowed) {
    return reply({ error: 'Too many requests.', code: 'RATE_LIMITED', retryAfter: limit.retryAfter }, 429);
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return reply({ error: 'Batch is too large.', code: 'TOO_LARGE' }, 413);
  let body: { sentAt?: string; events?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: 'Invalid JSON.', code: 'BAD_REQUEST' }, 400);
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return reply({ error: 'Send an events array.', code: 'BAD_REQUEST' }, 400);
  }
  if (body.events.length > MAX_BATCH) {
    return reply({ error: `At most ${MAX_BATCH} events per batch.`, code: 'TOO_MANY_EVENTS' }, 413);
  }
  const events = body.events.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object');
  const sent = typeof body.sentAt === 'string' ? Date.parse(body.sentAt) : NaN;

  const results = await processEvents(
    auth.user,
    events,
    Number.isFinite(sent) ? new Date(sent) : null,
    request.headers.get('x-app-version')?.slice(0, 40) ?? null,
  );
  // The app shows this total plus whatever it still has queued, so both sides read the same number.
  // A batch of only tap summaries cannot change the count, so skip the extra read for it.
  const onlyTaps = events.every((e) => e.type === 'feature_click');
  const total = onlyTaps ? null : await prisma.user.findUnique({ where: { id: auth.user.id }, select: { printCountTotal: true } });
  const payload = { results, serverTime: new Date().toISOString(), printCountTotal: total?.printCountTotal ?? null };
  const onlyMissingPrinter = results.every((r) => r.status === 'rejected' && r.reason === 'PRINTER_REQUIRED');
  return reply(onlyMissingPrinter ? { ...payload, error: 'A printer is required.', code: 'PRINTER_REQUIRED' } : payload, onlyMissingPrinter ? 400 : 200);
}
