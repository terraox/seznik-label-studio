import { prisma } from './prisma';

export const SDK_FAMILIES = ['dev', 'tez', 'josh', 'labelx', 'td404', 'unknown'] as const;
export type SdkFamily = (typeof SDK_FAMILIES)[number];

/**
 * "Seznik Tejas_1A2B" and "TD404-77AF" -> the model without the per-device suffix
 * (4-12 hex characters or a MAC address after a space, underscore or dash).
 */
export function normalizePrinterName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  const stripped = name
    .replace(/[\s_-]+(?:[0-9A-F]{2}:){2,5}[0-9A-F]{2}$/i, '')
    .replace(/[\s_-]+[0-9A-F]{4,12}$/i, '')
    .trim();
  return stripped || name;
}

export function guessSdkFamily(raw: string, hint?: string | null): SdkFamily {
  if (hint && (SDK_FAMILIES as readonly string[]).includes(hint)) return hint as SdkFamily;
  if (/td-?404/i.test(raw)) return 'td404';
  if (/tej|tez|shakti/i.test(raw)) return 'tez';
  if (/josh/i.test(raw)) return 'josh';
  if (/label ?x/i.test(raw)) return 'labelx';
  if (/\bdev\b/i.test(raw)) return 'dev';
  return 'unknown';
}

/** Finds (or creates) the registry row for a printer name as the SDK reported it. */
export async function upsertPrinter(rawName: string, familyHint?: string | null) {
  const nameRaw = rawName.trim().slice(0, 120);
  const existing = await prisma.printer.findUnique({ where: { nameRaw } });
  if (existing) return existing;
  const model = normalizePrinterName(nameRaw);
  const alias = await prisma.printerAlias.findFirst({
    where: { OR: [{ pattern: { equals: nameRaw, mode: 'insensitive' } }, { pattern: { equals: model, mode: 'insensitive' } }] },
  });
  const modelNormalised = alias?.modelNormalised ?? model;
  return prisma.printer.upsert({
    where: { nameRaw },
    update: {},
    create: { nameRaw, modelNormalised, sdkFamily: guessSdkFamily(nameRaw, familyHint) },
  });
}
