import type { PaperType } from '@/lib/label-document';
import { buildDiagnosticCompactLabelDocument } from '@/lib/printer/diagnostic-test-label';
import { printLabelDocumentMainPipeline } from '@/lib/printer/main-pipeline-print';
import {
  PAPER_TYPES,
  formatPaperTypeSetting,
  paperPrinterId,
  paperTypeCommand,
  type PaperPrinterId,
} from '@/lib/printer/paper-type';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';

export const PAPER_TYPE_TEST_GAP_MM = 3;

export const PAPER_TYPE_TEST_PHOTO =
  'Photograph the whole label, the gap or black mark that passed the sensor, and the next label if the printer skipped or fed extra. Note a jam, a blank label, or a skip.';

const EXPECT: Record<PaperType, string> = {
  Label: 'One die-cut label. Stops at the next gap.',
  Receipt: 'Continuous feed. No gap seek. Unconfirmed.',
  'Black mark': 'Starts after the mark. Sensor may mis-feed.',
  Cardstock: 'Same command as Label. Not its own sensor.',
  Transparent: 'Same command as Label. Not its own sensor.',
};

export type PaperTypeTestRow = {
  paperType: PaperType;
  setting: string;
  expect: string;
};

export function activePaperTypeTestPrinter(): PaperPrinterId | null {
  const manager = getPrinterManager();
  if (manager.isLabelX || manager.isTez) return null;
  if (!manager.isJosh && !manager.isDev && !manager.usesTd404CommandSet) return null;
  return paperPrinterId({ isJosh: manager.isJosh, isDev: manager.isDev });
}

export function paperTypeTestRows(printer: PaperPrinterId): PaperTypeTestRow[] {
  return PAPER_TYPES.map((paperType) => {
    const command = paperTypeCommand({
      printer,
      paperType,
      gapMm: PAPER_TYPE_TEST_GAP_MM,
    });
    return {
      paperType,
      setting: formatPaperTypeSetting(command),
      expect: EXPECT[paperType],
    };
  });
}

/** Print one test-sheet label. The ink and the log line both show the setting that was sent. */
export async function printPaperTypeTestRow(paperType: PaperType): Promise<string> {
  const manager = getPrinterManager();
  if (manager.isLabelX || manager.isTez) {
    throw new Error('Label X and Tez are not part of the paper type test.');
  }
  const printer = activePaperTypeTestPrinter();
  if (!printer) {
    throw new Error('Connect a Josh, TD-404, or Dev printer.');
  }
  if (
    printer === 'dev' &&
    paperType === 'Black mark' &&
    usePrinterStore.getState().devCommandSet === 'escpos'
  ) {
    throw new Error('ESC/POS has no black-mark command. Switch Dev to TSPL before this row.');
  }
  const command = paperTypeCommand({
    printer,
    paperType,
    gapMm: PAPER_TYPE_TEST_GAP_MM,
  });
  const setting = formatPaperTypeSetting(command);
  const lines = [paperType, setting, EXPECT[paperType]];
  const doc = {
    ...buildDiagnosticCompactLabelDocument(lines, 50, 30),
    paperType,
  };
  console.info(`[PAPER-TYPE-SHEET] ${printer} ${paperType} ${setting}`);
  await printLabelDocumentMainPipeline(doc, { gapMm: PAPER_TYPE_TEST_GAP_MM });
  return setting;
}
