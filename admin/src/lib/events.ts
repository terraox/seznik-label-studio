import type { User } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { FEATURES } from './features';
import { upsertPrinter } from './printer-registry';
import { prisma } from './prisma';
import { hit } from './rate-limit';

export const MAX_BATCH = 50;

type Db = Pick<typeof prisma, '$executeRaw'>;

/**
 * Keeps the per-user, per-printer summary (UserPrinter) in step with each event, so the user card
 * never has to group the full history. `at` only ever moves the last-connected time forward.
 */
async function touchUserPrinter(
  db: Db,
  userId: string,
  printerId: string,
  at: Date,
  add: { connections?: number; labels?: number; transport?: string },
) {
  await db.$executeRaw`
    INSERT INTO "UserPrinter" ("id", "userId", "printerId", "firstConnectedAt", "lastConnectedAt", "connectionCount", "labelsPrinted", "lastTransport")
    VALUES ('up_' || md5(${userId} || ':' || ${printerId}), ${userId}, ${printerId}, ${at}, ${at}, ${add.connections ?? 0}, ${add.labels ?? 0}, ${add.transport ?? null})
    ON CONFLICT ("userId", "printerId") DO UPDATE SET
      "firstConnectedAt" = LEAST("UserPrinter"."firstConnectedAt", EXCLUDED."firstConnectedAt"),
      "lastTransport" = CASE WHEN ${add.transport ?? null}::text IS NOT NULL AND EXCLUDED."lastConnectedAt" >= "UserPrinter"."lastConnectedAt"
                             THEN EXCLUDED."lastTransport" ELSE "UserPrinter"."lastTransport" END,
      "lastConnectedAt" = GREATEST("UserPrinter"."lastConnectedAt", EXCLUDED."lastConnectedAt"),
      "connectionCount" = "UserPrinter"."connectionCount" + EXCLUDED."connectionCount",
      "labelsPrinted" = "UserPrinter"."labelsPrinted" + EXCLUDED."labelsPrinted"`;
}
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const CONNECT_DEDUPE_MS = 10 * 60 * 1000;
const FEATURE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const FEATURE_BATCH_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_FEATURE_KEYS = 60;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const PRINT_SOURCES = ['manual_size', 'template', 'excel_bulk', 'pdf', 'photo', 'scan', 'serial', 'other'] as const;
const TRANSPORTS = ['bt_spp', 'ble', 'wifi'];
const FEEDBACK_CATEGORIES = ['suggestion', 'feedback'];
const SHOP_CATEGORIES = ['labels', 'printers'];
const REQUEST_SHAPES = ['rectangle', 'rounded', 'circle', 'other'];

export type EventResult = {
  eventId: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: string;
};

type Raw = Record<string, unknown>;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const cleanText = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const round1 = (n: number) => Math.round(n * 10) / 10;
const mm = (n: number) => String(round1(n));

/** Grouping key for "most printed label": design size, never the rotated paper size. */
export function labelKey(source: string, widthMm: number, heightMm: number, templateId?: string | null, ups = 1) {
  // A label made with "labels across" (2 ups, 3 ups…) is a different label from the single one.
  const size = `${mm(widthMm)}x${mm(heightMm)}${ups > 1 ? `:ups${ups}` : ''}`;
  return source === 'template' && templateId ? `template:${templateId}:${size}` : `manual:${size}`;
}

/**
 * Applies one batch for one signed-in user. Safe to retry: every event has a client uuid and a
 * repeat is reported as `duplicate` without counting twice. `sentAt` is the device clock when the
 * batch was sent; the difference to the server clock corrects each event's time.
 */
export async function processEvents(user: User, rawEvents: Raw[], sentAt: Date | null, appVersion: string | null) {
  const now = Date.now();
  const skew = sentAt ? now - sentAt.getTime() : 0;
  const results: EventResult[] = [];

  for (const raw of rawEvents) {
    const eventId = str(raw.eventId, 80);
    const reject = (reason: string): EventResult => ({ eventId, status: 'rejected', reason });
    if (!eventId) {
      results.push(reject('MISSING_EVENT_ID'));
      continue;
    }
    const when = typeof raw.occurredAt === 'string' ? Date.parse(raw.occurredAt) : NaN;
    if (!Number.isFinite(when)) {
      results.push(reject('BAD_TIME'));
      continue;
    }
    const occurredAt = new Date(when + skew);
    if (occurredAt.getTime() > now + FUTURE_SLACK_MS) {
      results.push(reject('FUTURE'));
      continue;
    }
    if (now - occurredAt.getTime() > MAX_AGE_MS) {
      results.push(reject('TOO_OLD'));
      continue;
    }
    try {
      results.push(await applyOne(user, raw, eventId, occurredAt, appVersion));
    } catch (err) {
      console.error('event failed', eventId, err);
      results.push(reject('SERVER_ERROR'));
    }
  }
  return results;
}

async function applyOne(user: User, raw: Raw, eventId: string, occurredAt: Date, appVersion: string | null): Promise<EventResult> {
  const reject = (reason: string): EventResult => ({ eventId, status: 'rejected', reason });
  const ok = (created: boolean): EventResult => ({ eventId, status: created ? 'accepted' : 'duplicate' });

  switch (raw.type) {
    case 'print': {
      const printerName = str(raw.printerName, 120);
      if (!printerName) return reject('PRINTER_REQUIRED');
      const source = str(raw.source, 20);
      if (!(PRINT_SOURCES as readonly string[]).includes(source)) return reject('BAD_SOURCE');
      const labels = num(raw.labels);
      const jobs = raw.jobs === undefined ? 1 : num(raw.jobs);
      const ups = raw.ups === undefined ? 1 : num(raw.ups);
      const width = num(raw.widthMm);
      const height = num(raw.heightMm);
      if (!Number.isInteger(labels) || labels < 1 || labels > 10_000) return reject('BAD_LABEL_COUNT');
      if (!Number.isInteger(jobs) || jobs < 1 || jobs > 10_000) return reject('BAD_JOB_COUNT');
      if (!Number.isInteger(ups) || ups < 1 || ups > 20) return reject('BAD_UPS');
      if (!(width >= 5 && width <= 300 && height >= 5 && height <= 300)) return reject('BAD_SIZE');
      const jobId = str(raw.jobId, 80) || eventId;
      const templateId = str(raw.templateId, 80) || null;
      const printer = await upsertPrinter(printerName, str(raw.sdkFamily, 20));
      const created = await prisma.$transaction(async (tx) => {
        const made = await tx.printEvent.createMany({
          skipDuplicates: true,
          data: [{
            eventId, jobId, userId: user.id, printerId: printer.id, source,
            labelWidthMm: round1(width), labelHeightMm: round1(height),
            templateId, templateNameSnapshot: str(raw.templateName, 120) || null,
            labelKey: labelKey(source, width, height, templateId, ups),
            jobs, labelsCount: labels, ups, appVersion, occurredAt,
          }],
        });
        if (made.count === 1) {
          // Same transaction as the insert, so the counter can never drift from the events.
          await tx.user.update({
            where: { id: user.id },
            data: {
              printCountTotal: { increment: labels },
              lastPrintAt: occurredAt,
            },
          });
          await touchUserPrinter(tx, user.id, printer.id, occurredAt, { labels });
        }
        return made.count === 1;
      });
      return ok(created);
    }

    case 'printer_connected': {
      const printerName = str(raw.printerName, 120);
      if (!printerName) return reject('PRINTER_REQUIRED');
      const transport = str(raw.transport, 10);
      if (!TRANSPORTS.includes(transport)) return reject('BAD_TRANSPORT');
      const printer = await upsertPrinter(printerName, str(raw.sdkFamily, 20));
      const recent = await prisma.printerConnection.findFirst({
        where: {
          userId: user.id,
          printerId: printer.id,
          occurredAt: { gt: new Date(occurredAt.getTime() - CONNECT_DEDUPE_MS), lt: new Date(occurredAt.getTime() + CONNECT_DEDUPE_MS) },
        },
        select: { id: true, occurredAt: true },
      });
      if (recent) {
        // Counted once, but "last connected" must still move forward on a reconnect.
        if (occurredAt > recent.occurredAt) {
          await prisma.printerConnection.update({ where: { id: recent.id }, data: { occurredAt } });
        }
        await touchUserPrinter(prisma, user.id, printer.id, occurredAt, { transport });
        return { eventId, status: 'duplicate', reason: 'RECENT_CONNECTION' };
      }
      const made = await prisma.printerConnection.createMany({
        skipDuplicates: true,
        data: [{ eventId, userId: user.id, printerId: printer.id, transport, occurredAt }],
      });
      if (made.count === 1) await touchUserPrinter(prisma, user.id, printer.id, occurredAt, { connections: 1, transport });
      return ok(made.count === 1);
    }

    case 'product_click': {
      const productKey = str(raw.productKey, 120);
      const category = str(raw.category, 20);
      if (!productKey) return reject('BAD_PRODUCT');
      if (!SHOP_CATEGORIES.includes(category)) return reject('BAD_CATEGORY');
      const made = await prisma.productClick.createMany({
        skipDuplicates: true,
        data: [{
          eventId, userId: user.id, productKey,
          productNameSnapshot: cleanText(str(raw.productName, 200)) || productKey,
          category, source: str(raw.source, 30) || 'shop_buy', occurredAt,
        }],
      });
      return ok(made.count === 1);
    }

    case 'feature_click': {
      // A summary the app built from many taps: { counts: { 'home.excel': 3, ... } }, added to the
      // day's totals in ONE statement. The signed-in user is deliberately not stored with it.
      if (!raw.counts || typeof raw.counts !== 'object' || Array.isArray(raw.counts)) return reject('BAD_COUNTS');
      if (Date.now() - occurredAt.getTime() > FEATURE_MAX_AGE_MS) return reject('TOO_OLD');
      const keys: string[] = [];
      const counts: number[] = [];
      for (const [key, value] of Object.entries(raw.counts as Raw).slice(0, MAX_FEATURE_KEYS)) {
        const n = num(value);
        // Unknown keys (a newer app) are skipped, not fatal.
        if (!Object.hasOwn(FEATURES, key) || !Number.isInteger(n) || n < 1 || n > 10_000) continue;
        keys.push(key);
        counts.push(n);
      }
      if (keys.length === 0) return reject('UNKNOWN_FEATURE');
      const day = new Date(occurredAt.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
      const added = await prisma.$transaction(async (tx) => {
        const seen = await tx.featureClickBatch.createMany({ data: [{ eventId }], skipDuplicates: true });
        if (seen.count === 0) return false;
        await tx.$executeRaw`
          INSERT INTO "FeatureClickDaily" ("day", "featureKey", "clicks")
          SELECT ${day}::date, k, c FROM unnest(${keys}::text[], ${counts}::int[]) AS t(k, c)
          ON CONFLICT ("day", "featureKey") DO UPDATE SET "clicks" = "FeatureClickDaily"."clicks" + EXCLUDED."clicks"`;
        return true;
      });
      // Keep the dedupe table small: now and then drop ids older than any send could still be retried.
      if (Math.random() < 0.02) {
        void prisma.featureClickBatch
          .deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - FEATURE_BATCH_KEEP_MS) } } })
          .catch(() => undefined);
      }
      return ok(added);
    }

    case 'feedback': {
      const category = str(raw.category, 20) || 'feedback';
      if (!FEEDBACK_CATEGORIES.includes(category)) return reject('BAD_CATEGORY');
      const title = cleanText(str(raw.title, 120));
      const message = cleanText(str(raw.message, 1000));
      if (title.length < 1 && message.length < 1) return reject('BAD_MESSAGE');
      // Rating is optional (legacy events still send 1–5).
      let rating: number | null = null;
      if (raw.rating != null && raw.rating !== '') {
        const n = num(raw.rating);
        if (!Number.isInteger(n) || n < 1 || n > 5) return reject('BAD_RATING');
        rating = n;
      }
      const printerName = cleanText(str(raw.printerName, 80)) || null;
      const already = await prisma.feedback.findUnique({ where: { eventId }, select: { id: true } });
      if (already) return ok(false);
      const slot = await hit(`feedback:${user.id}`, 5, 24 * 60 * 60 * 1000);
      if (!slot.allowed) return reject('RATE_LIMITED');
      try {
        await prisma.feedback.create({
          data: {
            eventId,
            userId: user.id,
            rating,
            category,
            title: title || null,
            printerName,
            message: message || null,
            appVersion,
            platform: str(raw.platform, 20) || null,
            createdAt: occurredAt,
          },
        });
        return ok(true);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return ok(false);
        throw err;
      }
    }

    case 'template_request': {
      const description = cleanText(str(raw.description, 500));
      if (description.length < 3) return reject('BAD_DESCRIPTION');
      const shape = str(raw.shape, 20) || null;
      if (shape && !REQUEST_SHAPES.includes(shape)) return reject('BAD_SHAPE');
      // Size is optional, but when given it must be a real label size.
      const size = (v: unknown) => {
        const n = num(v);
        return Number.isFinite(n) && n >= 5 && n <= 300 ? round1(n) : null;
      };
      const already = await prisma.templateRequest.findUnique({ where: { eventId }, select: { id: true } });
      if (already) return ok(false);
      const slot = await hit(`template_request:${user.id}`, 10, 24 * 60 * 60 * 1000);
      if (!slot.allowed) return reject('RATE_LIMITED');
      try {
        await prisma.templateRequest.create({
          data: {
            eventId,
            userId: user.id,
            description,
            widthMm: size(raw.widthMm),
            heightMm: size(raw.heightMm),
            shape,
            searchText: cleanText(str(raw.searchText, 120)) || null,
            appVersion,
            platform: str(raw.platform, 20) || null,
            createdAt: occurredAt,
          },
        });
        return ok(true);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return ok(false);
        throw err;
      }
    }

    default:
      return reject('UNKNOWN_TYPE');
  }
}
