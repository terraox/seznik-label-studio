import { Prisma } from '@prisma/client';

/** Per-printer figures with internal / test accounts optionally left out. */
export function printerCtes(hideInternal: boolean) {
  return Prisma.sql`
    conn AS (
      SELECT pc."printerId", pc."userId", pc."occurredAt"
      FROM "PrinterConnection" pc JOIN "AppUser" u ON u.id = pc."userId"
      WHERE (${!hideInternal} OR u."isInternal" = false)
    ),
    prn AS (
      SELECT pe."printerId", pe."userId", pe."labelsCount"
      FROM "PrintEvent" pe LEFT JOIN "AppUser" u ON u.id = pe."userId"
      WHERE (${!hideInternal} OR COALESCE(u."isInternal", false) = false)
    )`;
}


/** Print events with the internal-account and SDK-family filters applied. */
export function printEventsCte(hideInternal: boolean, family: string | null) {
  return Prisma.sql`
    ev AS (
      SELECT pe."occurredAt", pe."labelsCount", pe.jobs, pe."labelKey", pe."labelWidthMm", pe."labelHeightMm",
             pe."templateId", pe."templateNameSnapshot", pe."userId"
      FROM "PrintEvent" pe
      JOIN "Printer" p ON p.id = pe."printerId"
      LEFT JOIN "AppUser" u ON u.id = pe."userId"
      WHERE (${!hideInternal} OR COALESCE(u."isInternal", false) = false)
        AND (${family === null} OR p."sdkFamily" = ${family ?? ''})
    )`;
}

/** Start of the current calendar month in India time, as a timestamptz. */
export const MONTH_START_IST = Prisma.sql`(date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`;

export function parseFilters(url: URL) {
  return {
    hideInternal: url.searchParams.get('internal') === 'hide',
    family: url.searchParams.get('family') || null,
  };
}
