import { parseExcelFile, type ExcelParseOptions } from '@/lib/excel';
import type { PickedDocument } from '@/lib/file-import/pick-document';
import type { ExcelSheet } from '@/stores/data-store';

export type PickedExcelFile =
  | { ok: false; reason: 'cancelled' | 'invalid' }
  | { ok: true; name: string; uri: string; size?: number };

/** Map a document pick result to an Excel workbook pick result. */
export function toPickedExcelFile(picked: PickedDocument): PickedExcelFile {
  if (!picked.ok) return picked;
  return { ok: true, name: picked.name, uri: picked.uri, size: picked.size };
}

export async function parsePickedExcel(
  uri: string,
  name: string,
  options?: Partial<ExcelParseOptions>,
): Promise<ExcelSheet[]> {
  return parseExcelFile(uri, name, options);
}
