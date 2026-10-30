import { CONSUMER_PRINTERS, type ConsumerPrinterId } from '@/constants/printer-models';
import { resolveQualityBridge } from '@/lib/printer/bridge-quality-caps';
import { buildDiagnosticCompactLabelDocument } from '@/lib/printer/diagnostic-test-label';
import { JOSH_DENSITY_MAX, JOSH_SPEED_MIN } from '@/lib/printer/josh-job-params';
import { usePrinterStore } from '@/stores/printer-store';
import type { LabelDocument, PaperType } from '@/lib/label-document';
import { shownPaperType } from '@/lib/printer/paper-type';

/**
 * Same 50×15 strip for every bridge. Josh's old 25 mm canvas clipped long Bluetooth
 * names and forced tiny/bold type; the head is ~48 mm and already prints 50 mm jobs.
 */
const TEST_LABEL = { widthMm: 50, heightMm: 15 };

/** Name of the printer bridge in use: Tejas, Rudra or Josh. */
export function testPrintBridgeName(): string {
  const { sdkId, selectedPrinterModel } = usePrinterStore.getState();
  const id: ConsumerPrinterId = sdkId === 'josh' ? 'josh' : selectedPrinterModel;
  return (CONSUMER_PRINTERS[id] ?? CONSUMER_PRINTERS.tejas).shortName;
}

/** 2 mm from the left die-cut edge in label coords. */
export const TEST_PRINT_DIE_CUT_INSET_MM = 2;

/** Studio / bridge / Bluetooth name — three single lines, never wrapped. */
export function testPrintLines(bridgeName: string, bluetoothName: string, _narrow?: boolean): string[] {
  return ['seznik label studio', bridgeName, bluetoothName];
}

export function buildTestPrintDocument(paperType?: PaperType): { doc: LabelDocument; lines: string[] } {
  const store = usePrinterStore.getState();
  const bridgeName = testPrintBridgeName();
  const bluetoothName = store.deviceName?.trim() || store.deviceId || 'Unknown';
  const josh = bridgeName === CONSUMER_PRINTERS.josh.shortName;
  const lines = testPrintLines(bridgeName, bluetoothName, josh);
  // Regular 7 pt on 50 mm: full BT name on one line, no bold, no shrink-to-fit.
  const doc = buildDiagnosticCompactLabelDocument(lines, TEST_LABEL.widthMm, TEST_LABEL.heightMm, {
    marginMm: TEST_PRINT_DIE_CUT_INSET_MM,
    marginTopMm: josh ? TEST_PRINT_DIE_CUT_INSET_MM : 0,
    marginRightMm: 1,
    lineHeightMm: 3.6,
    fontPt: 7,
    maxLines: 3,
    bold: false,
  });
  // Same mapping as a normal print: the bridge turns this into its own media command.
  return { doc: { ...doc, paperType: shownPaperType(paperType, store.sdkId) }, lines };
}

/**
 * Tejas/Rudra: Auto (null) — max heat fattens TD-404 bitmap strokes.
 * Josh: LPAPI max darkness 14 + slowest speed 1 (no bitmap ink grow).
 */
export function testPrintQuality(
  activeTransport: Parameters<typeof resolveQualityBridge>[0]['activeTransport'],
): { darkness: number | null; speed: number | null } {
  const state = usePrinterStore.getState();
  const bridge = resolveQualityBridge({
    activeTransport,
    storeTransport: state.transport,
    sdkId: state.sdkId,
  });
  const isJosh =
    bridge === 'josh-lpapi' || state.sdkId === 'josh' || activeTransport === 'josh-lpapi';
  if (!isJosh) return { darkness: null, speed: null };
  return { darkness: JOSH_DENSITY_MAX, speed: JOSH_SPEED_MIN };
}
