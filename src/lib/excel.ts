import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

import { worksheetToStringGrid } from '@/lib/excel-cells';
import { splitSheetRows, type ExcelParseOptions } from '@/lib/excel-rows';
import type { ExcelSheet } from '@/stores/data-store';

export { excelCellToString, worksheetToStringGrid } from '@/lib/excel-cells';
export { splitSheetRows, resolveExcelParseOptions, DEFAULT_EXCEL_PARSE_OPTIONS } from '@/lib/excel-rows';
export type { ExcelParseOptions } from '@/lib/excel-rows';

/** Parse an .xlsx/.xls/.csv file from a local URI into sheets with header columns. */
export async function parseExcelFile(
  uri: string,
  fileName: string,
  options?: Partial<ExcelParseOptions>,
): Promise<ExcelSheet[]> {
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  let workbook: XLSX.WorkBook;
  if (isCsv) {
    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    workbook = XLSX.read(content, { type: 'string' });
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    workbook = XLSX.read(base64, { type: 'base64' });
  }

  const sheets: ExcelSheet[] = [];
  let firstError: Error | null = null;
  for (const name of workbook.SheetNames) {
    const allRows = worksheetToStringGrid(workbook.Sheets[name]);
    try {
      const split = splitSheetRows(allRows, options);
      if (split.columns.length === 0) continue;
      sheets.push({ name, columns: split.columns, rows: split.rows });
    } catch (err) {
      firstError ??= err instanceof Error ? err : new Error('Could not read this sheet.');
    }
  }
  if (sheets.length === 0 && firstError) throw firstError;
  return sheets;
}
