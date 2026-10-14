import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { ExcelImportOptionsModal } from '@/components/excel-import-options-modal';
import { parsePickedExcel, toPickedExcelFile } from '@/lib/excel-import';
import { withManualExportHint } from '@/lib/file-import/sheet-export-guidance';
import { useDocumentSourcePicker } from '@/lib/file-import/use-document-source-picker';
import type { ExcelParseOptions } from '@/lib/excel-rows';
import type { ExcelSheet } from '@/stores/data-store';

export type ExcelImportSuccess = {
  name: string;
  uri: string;
  size?: number;
  sheets: ExcelSheet[];
  hasHeaderRow: boolean;
  dataStartRow: number;
};

type PendingExcelFile = {
  name: string;
  uri: string;
  size?: number;
};

const INVALID_EXCEL = 'Please choose an Excel workbook (.xlsx / .xls) or CSV file.';

function alertImportError(error: unknown) {
  Alert.alert(
    'Error',
    withManualExportHint(error instanceof Error ? error.message : 'Unable to read this spreadsheet.'),
  );
}

/**
 * Pick a workbook (or accept one already picked), ask for the header and start row, then parse.
 * Render `excelImportModal` in the same screen.
 */
export function useExcelImportFlow(): {
  importExcel: () => Promise<ExcelImportSuccess | null>;
  importExcelFromFile: (file: { name: string; uri: string; size?: number }) => Promise<ExcelImportSuccess | null>;
  pickDocumentWithSource: ReturnType<typeof useDocumentSourcePicker>['pickDocumentWithSource'];
  excelImportModal: ReactNode;
  documentSourceSheet: ReactNode;
} {
  const [pending, setPending] = useState<PendingExcelFile | null>(null);
  const resolveRef = useRef<((value: ExcelImportSuccess | null) => void) | null>(null);
  const { pickDocumentWithSource, documentSourceSheet } = useDocumentSourcePicker();

  const settle = useCallback((value: ExcelImportSuccess | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    resolve?.(value);
  }, []);

  const beginPrompt = useCallback((file: PendingExcelFile) => {
    return new Promise<ExcelImportSuccess | null>((resolve) => {
      if (resolveRef.current) resolveRef.current(null);
      resolveRef.current = resolve;
      setPending(file);
    });
  }, []);

  const importExcelFromFile = useCallback(
    (file: PendingExcelFile) => beginPrompt(file),
    [beginPrompt],
  );

  const importExcel = useCallback(async () => {
    try {
      const picked = toPickedExcelFile(await pickDocumentWithSource({ preset: 'excel' }));
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('Invalid File', INVALID_EXCEL);
        return null;
      }
      return await beginPrompt({ name: picked.name, uri: picked.uri, size: picked.size });
    } catch (error) {
      alertImportError(error);
      return null;
    }
  }, [beginPrompt, pickDocumentWithSource]);

  const confirm = async (options: ExcelParseOptions) => {
    const file = pending;
    if (!file) {
      settle(null);
      return;
    }
    try {
      const sheets = await parsePickedExcel(file.uri, file.name, options);
      if (sheets.length === 0 || sheets.every((sheet) => sheet.rows.length === 0)) {
        Alert.alert('Empty File', 'No data rows were found from that start row.');
        settle(null);
        return;
      }
      settle({
        name: file.name,
        uri: file.uri,
        size: file.size,
        sheets,
        hasHeaderRow: options.hasHeaderRow,
        dataStartRow: options.dataStartRow,
      });
    } catch (error) {
      alertImportError(error);
      settle(null);
    }
  };

  const excelImportModal = (
    <ExcelImportOptionsModal
      visible={pending != null}
      fileName={pending?.name}
      onCancel={() => settle(null)}
      onConfirm={(options) => {
        void confirm(options);
      }}
    />
  );

  return {
    importExcel,
    importExcelFromFile,
    pickDocumentWithSource,
    excelImportModal,
    documentSourceSheet,
  };
}
