import { CONSUMER_PRINTERS, type ConsumerPrinterId } from '@/constants/printer-models';
import { qualityCapsFor, resolveQualityBridge } from '@/lib/printer/bridge-quality-caps';
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

/** The four facts on the label. Josh's narrow label wraps them over six short lines. */
export function testPrintLines(bridgeName: string, bluetoothName: string, narrow: boolean): string[] {
  if (narrow) {
    return ['Test print by', 'Seznik Label Studio', 'Software by', 'Seznik India', bridgeName, bluetoothName];
  }
  return ['Test print by Seznik Label Studio', 'Software by Seznik India', bridgeName, bluetoothName];
}

export function buildTestPrintDocument(): { doc: LabelDocument; lines: string[] } {
  const store = usePrinterStore.getState();
  const bridgeName = testPrintBridgeName();
  const bluetoothName = store.deviceName?.trim() || store.deviceId || 'Unknown';
  const josh = bridgeName === CONSUMER_PRINTERS.josh.shortName;
  const lines = testPrintLines(bridgeName, bluetoothName, josh);
  const size = josh ? JOSH_LABEL : STRIP_LABEL;
  const doc = buildDiagnosticCompactLabelDocument(lines, size.widthMm, size.heightMm, josh
    ? { marginMm: 0, marginTopMm: 2, lineHeightMm: 2.1, fontPt: 5.5, maxLines: 6 }
    : { marginMm: 1, marginTopMm: 1, lineHeightMm: 3.4, fontPt: 6, maxLines: 4, bold: true });
  return { doc, lines };
}

/** Darkness and speed a normal Auto print uses. Undefined lets the pipeline pick that default. */
export function testPrintQuality(
  activeTransport: Parameters<typeof resolveQualityBridge>[0]['activeTransport'],
): { darkness: number | undefined; speed: number | undefined } {
  const state = usePrinterStore.getState();
  const bridge = resolveQualityBridge({
    activeTransport,
    storeTransport: state.transport,
    sdkId: state.sdkId,
  });
  const caps = qualityCapsFor(bridge);
  return {
    darkness: caps.density === 'legacy' ? undefined : caps.density.default,
    speed: caps.speed === 'legacy' ? undefined : caps.speed.default,
  };
}
