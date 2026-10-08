export type ExcelParseOptions = {
  hasHeaderRow: boolean;
  /** 1-based sheet row where label data begins. */
  dataStartRow: number;
};

export const DEFAULT_EXCEL_PARSE_OPTIONS: ExcelParseOptions = {
  hasHeaderRow: true,
  dataStartRow: 2,
};

export function resolveExcelParseOptions(options?: Partial<ExcelParseOptions>): ExcelParseOptions {
  const hasHeaderRow = options?.hasHeaderRow ?? DEFAULT_EXCEL_PARSE_OPTIONS.hasHeaderRow;
  const dataStartRow =
    options?.dataStartRow ?? (hasHeaderRow ? DEFAULT_EXCEL_PARSE_OPTIONS.dataStartRow : 1);
  return { hasHeaderRow, dataStartRow };
}

function columnLabels(count: number, header?: string[]): string[] {
  return Array.from({ length: count }, (_, index) => {
    const named = header?.[index]?.trim();
    return named ? named : `Column ${index + 1}`;
  });
}

/**
 * Split a full worksheet grid into column names and data rows.
 * `dataStartRow` is a 1-based sheet row. With a header, row 1 is names and data starts at 2 or later.
 */
export function splitSheetRows(
  allRows: string[][],
  options?: Partial<ExcelParseOptions>,
): { columns: string[]; rows: string[][] } {
  const resolved = resolveExcelParseOptions(options);
  if (allRows.length === 0) return { columns: [], rows: [] };

  const minStart = resolved.hasHeaderRow ? 2 : 1;
  const start = Math.trunc(resolved.dataStartRow);
  if (!Number.isFinite(start) || start < minStart) {
    throw new Error(
      resolved.hasHeaderRow
        ? 'Start row must be 2 or later when the first row has column names.'
        : 'Start row must be 1 or later.',
    );
  }
  if (start > allRows.length) {
    const noun = allRows.length === 1 ? 'row' : 'rows';
    throw new Error(`Start row ${start} is past the end of this sheet (${allRows.length} ${noun}).`);
  }

  const columns = resolved.hasHeaderRow
    ? columnLabels((allRows[0] ?? []).length, allRows[0])
    : columnLabels(allRows.reduce((max, row) => Math.max(max, row.length), 0));

  if (columns.length === 0) return { columns: [], rows: [] };

  const rows = allRows
    .slice(start - 1)
    .filter((row) => row.some((cell) => cell.trim() !== ''));

  return { columns, rows };
}
