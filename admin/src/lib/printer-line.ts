import { Prisma } from '@prisma/client';

/**
 * The product line a printer belongs to, read from its Bluetooth name (the same rule the app's
 * connect page uses): B15... is Tejas, B17... is Rudra, LD0801... is Josh.
 */
export const PRINTER_LINES = [
  { id: 'tejas', label: 'SEZNIK Tejas', prefix: 'B15' },
  { id: 'rudra', label: 'SEZNIK Rudra', prefix: 'B17' },
  { id: 'josh', label: 'SEZNIK Josh', prefix: 'LD0801' },
] as const;

export type PrinterLineId = (typeof PRINTER_LINES)[number]['id'] | 'other';

export function printerLineOf(btName: string): PrinterLineId {
  const name = btName.trim().toUpperCase();
  return PRINTER_LINES.find((l) => name.startsWith(l.prefix))?.id ?? 'other';
}

export const printerLineLabel = (id: PrinterLineId) => PRINTER_LINES.find((l) => l.id === id)?.label ?? 'Other';

/** SQL twin of printerLineOf for a column holding the Bluetooth name. */
export function printerLineSql(column: Prisma.Sql) {
  return Prisma.sql`CASE
    WHEN upper(${column}) LIKE 'B15%' THEN 'tejas'
    WHEN upper(${column}) LIKE 'B17%' THEN 'rudra'
    WHEN upper(${column}) LIKE 'LD0801%' THEN 'josh'
    ELSE 'other' END`;
}
