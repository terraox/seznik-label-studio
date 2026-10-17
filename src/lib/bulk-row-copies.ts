import type { ExcelSheet } from '@/stores/data-store';

export const MAX_COPIES_PER_ROW = 99;
export const MAX_JOB_LABELS = 500;

const COPIES_HEADER = /^(copies|qty|quantity|pcs|count)$/i;

export type ParsedCopiesCell = {
  copies: number;
  /** Text, NaN, negative, or above the per-row cap. Blank is not a change. */
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
  if (value < 0) return { copies: 0, changed: true };
  const floored = Math.floor(value);
  if (floored > MAX_COPIES_PER_ROW) return { copies: MAX_COPIES_PER_ROW, changed: true };
  return { copies: floored, changed: false };
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

export function countChangedCopiesCells(sheet: ExcelSheet, columnIndex: number | null): number {
  if (columnIndex == null || columnIndex < 0 || columnIndex >= sheet.columns.length) return 0;
  let changed = 0;
  for (const row of sheet.rows) {
    if (parseCopiesCell(row[columnIndex]).changed) changed += 1;
  }
  return changed;
}

export function planBulkPrint(
  sheet: ExcelSheet,
  copiesColumnIndex: number | null | undefined,
  multiply: number,
): BulkPrintPlan {
  const factor = Math.max(1, Math.floor(Number.isFinite(multiply) ? multiply : 1));
  const column =
    copiesColumnIndex == null ||
    copiesColumnIndex < 0 ||
    copiesColumnIndex >= sheet.columns.length
      ? null
      : copiesColumnIndex;
  const rows: BulkPrintRow[] = [];
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
    const parsed =
      column == null ? { copies: 1, changed: false } : parseCopiesCell(sheet.rows[rowIndex]?.[column]);
    const copies = parsed.copies * factor;
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
