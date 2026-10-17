import type { ExcelSheet } from '@/stores/data-store';

export const MAX_COPIES_PER_ROW = 99;
export const MAX_JOB_LABELS = 500;

const COPIES_HEADER = /^(copies|qty|quantity|pcs|count)$/i;

export type ParsedCopiesCell = {
  copies: number;
  /** Anything that is not a whole number from 1 to 99. Blank is not a change. */
  changed: boolean;
};

export type BulkPrintRow = {
  rowIndex: number;
  copies: number;
};

export type BulkPrintPlan = {
  rows: BulkPrintRow[];
  totalPhysical: number;
  allZero: boolean;
  overCap: boolean;
};

export function parseCopiesCell(raw: string | undefined | null): ParsedCopiesCell {
  const text = (raw ?? '').trim();
  if (!text) return { copies: 1, changed: false };
  const value = Number(text);
  if (!Number.isFinite(value)) return { copies: 1, changed: true };
  const floored = Math.floor(value);
  const copies = Math.min(MAX_COPIES_PER_ROW, Math.max(1, floored));
  const clean = /^\d+$/.test(text) && floored >= 1 && floored <= MAX_COPIES_PER_ROW;
  return { copies, changed: !clean };
}

function columnOrNull(
  sheet: ExcelSheet,
  copiesColumnIndex: number | null | undefined,
): number | null {
  if (
    copiesColumnIndex == null ||
    copiesColumnIndex < 0 ||
    copiesColumnIndex >= sheet.columns.length
  ) {
    return null;
  }
  return copiesColumnIndex;
}

/** A stored editor edit wins when it is a whole number from 1 to 99. */
export function resolveRowCopies(
  sheet: ExcelSheet,
  rowIndex: number,
  copiesColumnIndex: number | null | undefined,
  overrides?: Record<string, number> | null,
): number {
  const override = overrides?.[String(rowIndex)];
  if (
    typeof override === 'number' &&
    Number.isInteger(override) &&
    override >= 1 &&
    override <= MAX_COPIES_PER_ROW
  ) {
    return override;
  }
  const column = columnOrNull(sheet, copiesColumnIndex);
  if (column == null) return 1;
  return parseCopiesCell(sheet.rows[rowIndex]?.[column]).copies;
}

/** Blank cells are allowed. A column qualifies when it has at least one number and no other text. */
export function columnEligibleForCopies(sheet: ExcelSheet, columnIndex: number): boolean {
  let sawNumber = false;
  for (const row of sheet.rows) {
    const text = (row[columnIndex] ?? '').trim();
    if (!text) continue;
    if (!Number.isFinite(Number(text))) return false;
    sawNumber = true;
  }
  return sawNumber;
}

export function copiesColumnChoices(sheet: ExcelSheet): number[] {
  return sheet.columns
    .map((_, index) => index)
    .filter((index) => columnEligibleForCopies(sheet, index));
}

export function guessCopiesColumnIndex(sheet: ExcelSheet): number | null {
  for (let index = 0; index < sheet.columns.length; index++) {
    const name = (sheet.columns[index] ?? '').trim();
    if (COPIES_HEADER.test(name) && columnEligibleForCopies(sheet, index)) return index;
  }
  return null;
}

/** 1-based data-row numbers whose cells were adjusted into 1–99. */
export function changedCopiesRowNumbers(
  sheet: ExcelSheet,
  columnIndex: number | null,
): number[] {
  if (columnIndex == null || columnIndex < 0 || columnIndex >= sheet.columns.length) return [];
  const rows: number[] = [];
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
    if (parseCopiesCell(sheet.rows[rowIndex]?.[columnIndex]).changed) rows.push(rowIndex + 1);
  }
  return rows;
}

export function countChangedCopiesCells(sheet: ExcelSheet, columnIndex: number | null): number {
  return changedCopiesRowNumbers(sheet, columnIndex).length;
}

/** One summary line. Ten or fewer adjusted rows also list those row numbers. */
export function copiesChangeSummary(sheet: ExcelSheet, columnIndex: number | null): string | null {
  const rows = changedCopiesRowNumbers(sheet, columnIndex);
  if (rows.length === 0) return null;
  const line =
    rows.length === 1
      ? '1 value was changed to 1–99'
      : `${rows.length} values were changed to 1–99`;
  if (rows.length > 10) return line;
  return `${line} (rows ${rows.join(', ')})`;
}

export type BulkSend = {
  rowIndex: number;
  /** Labels in this send. Uncollated is the row count. Collated is always 1. */
  copies: number;
  /** 1-based copy of this row. */
  copyNumber: number;
  /** 1-based round. Uncollated sends are round 1. */
  round: number;
};

/** True when grouped and collated paper orders differ. */
export function collateChangesOrder(rows: readonly { copies: number }[]): boolean {
  const printable = rows.filter((row) => row.copies > 0);
  if (printable.length < 2) return false;
  return printable.slice(0, -1).some((row) => row.copies > 1);
}

/**
 * Grouped: one send per row, native copies = the row count.
 * Collated: one send per physical label, copies = 1, rows with fewer copies drop out.
 * A count of 0 is omitted. Sheet parsing never produces 0; callers can still pass one.
 */
export function bulkSendList(rows: readonly BulkPrintRow[], collate: boolean): BulkSend[] {
  const printable = rows.filter((row) => row.copies > 0);
  if (!collate) {
    return printable.map((row) => ({
      rowIndex: row.rowIndex,
      copies: row.copies,
      copyNumber: 1,
      round: 1,
    }));
  }
  const remaining = printable.map((row) => row.copies);
  const sends: BulkSend[] = [];
  let round = 1;
  for (;;) {
    let placed = false;
    for (let index = 0; index < printable.length; index++) {
      if (remaining[index] <= 0) continue;
      const row = printable[index];
      const copyNumber = row.copies - remaining[index] + 1;
      remaining[index] -= 1;
      sends.push({
        rowIndex: row.rowIndex,
        copies: 1,
        copyNumber,
        round,
      });
      placed = true;
    }
    if (!placed) return sends;
    round += 1;
  }
}

/** First call stores the factory result. Later calls return that same value. */
export function rememberRowRaster<T>(cache: Map<number, T>, rowIndex: number, create: () => T): T {
  const existing = cache.get(rowIndex);
  if (existing !== undefined) return existing;
  const created = create();
  cache.set(rowIndex, created);
  return created;
}

export function planBulkPrint(
  sheet: ExcelSheet,
  copiesColumnIndex: number | null | undefined,
  multiply: number,
  overrides?: Record<string, number> | null,
): BulkPrintPlan {
  const factor = Math.max(1, Math.floor(Number.isFinite(multiply) ? multiply : 1));
  const rows: BulkPrintRow[] = [];
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
    const copies = resolveRowCopies(sheet, rowIndex, copiesColumnIndex, overrides) * factor;
    if (copies > 0) rows.push({ rowIndex, copies });
  }
  const totalPhysical = rows.reduce((sum, row) => sum + row.copies, 0);
  return {
    rows,
    totalPhysical,
    allZero: sheet.rows.length > 0 && totalPhysical === 0,
    overCap: totalPhysical > MAX_JOB_LABELS,
  };
}
