import { CONSUMER_PRINTERS, type ConsumerPrinterId } from '@/constants/printer-models';
import { buildDiagnosticCompactLabelDocument } from '@/lib/printer/diagnostic-test-label';
import { usePrinterStore } from '@/stores/printer-store';
import type { LabelDocument } from '@/lib/label-document';

/** Josh prints everything on a 25x15 mm label; the others on a 50x15 mm strip. */
const JOSH_LABEL = { widthMm: 25, heightMm: 15 };
const STRIP_LABEL = { widthMm: 50, heightMm: 15 };

/** Name of the printer bridge in use: Tejas, Rudra or Josh. */
export function testPrintBridgeName(): string {
  const { sdkId, selectedPrinterModel } = usePrinterStore.getState();
  const id: ConsumerPrinterId = sdkId === 'josh' ? 'josh' : selectedPrinterModel;
  return (CONSUMER_PRINTERS[id] ?? CONSUMER_PRINTERS.tejas).shortName;
}

/** 2 mm from the left die-cut edge in label coords. */
export const TEST_PRINT_DIE_CUT_INSET_MM = 2;

/** Studio / bridge / Bluetooth name. */
export function testPrintLines(bridgeName: string, bluetoothName: string, _narrow?: boolean): string[] {
  return ['seznik label studio', bridgeName, bluetoothName];
}

export function buildTestPrintDocument(): { doc: LabelDocument; lines: string[] } {
  const store = usePrinterStore.getState();
  const bridgeName = testPrintBridgeName();
  const bluetoothName = store.deviceName?.trim() || store.deviceId || 'Unknown';
  const josh = bridgeName === CONSUMER_PRINTERS.josh.shortName;
  const lines = testPrintLines(bridgeName, bluetoothName, josh);
  const size = josh ? JOSH_LABEL : STRIP_LABEL;
  // Tejas/Rudra: top 0 + baked TD404_ELEMENT_SHIFT_V_MM (+2 mm) → ~2 mm on paper.
  // Josh: 25 mm strip — smaller type, left 2 mm; V bias cancelled in printTestLabel.
  const doc = buildDiagnosticCompactLabelDocument(lines, size.widthMm, size.heightMm, josh
    ? {
        marginMm: TEST_PRINT_DIE_CUT_INSET_MM,
        marginTopMm: TEST_PRINT_DIE_CUT_INSET_MM,
        marginRightMm: 0.5,
        lineHeightMm: 3.2,
        fontPt: 5.5,
        maxLines: 3,
        bold: false,
      }
    : {
        marginMm: TEST_PRINT_DIE_CUT_INSET_MM,
        marginTopMm: 0,
        marginRightMm: 0.5,
        lineHeightMm: 3.6,
        fontPt: 7,
        maxLines: 3,
        bold: false,
      });
  return { doc, lines };
}

/**
 * True Auto: null darkness/speed so the pipeline matches a normal Print job.
 * Explicit max darkness fattens TD-404 strokes (ink steps) and reads as bold.
 */
export function testPrintQuality(): { darkness: null; speed: null } {
  return { darkness: null, speed: null };
}
