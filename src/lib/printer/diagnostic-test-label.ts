import { DEFAULT_ELEMENT_STATE, DEFAULT_TEXT_FONT_PT } from '@/components/editor/types';
import { CONSUMER_PRINTERS } from '@/constants/printer-models';
import { createLabelDocument, generateId, type LabelDocument, type LabelElement } from '@/lib/label-document';
import type { PrinterTransport } from '@/stores/printer-store';
import { usePrinterStore } from '@/stores/printer-store';

export const DIAGNOSTIC_COMPACT_LABEL_WIDTH_MM = 50;
export const DIAGNOSTIC_COMPACT_LABEL_HEIGHT_MM = 15;
/**
 * Josh test label: 25x15 mm, ink 2 mm in from the die-cut. The Josh pipeline bakes a +2 mm
 * right and -1 mm up shift into every job, so the document margins cancel it: left 0, top 3.
 */
export const JOSH_TEST_LABEL_WIDTH_MM = 25;
export const JOSH_TEST_LABEL_HEIGHT_MM = 15;
export const JOSH_TEST_LABEL_MARGIN_MM = 0;
export const JOSH_TEST_LABEL_TOP_MM = 3;
export const DIAGNOSTIC_STANDARD_LABEL_WIDTH_MM = 50;
export const DIAGNOSTIC_STANDARD_LABEL_HEIGHT_MM = 30;

/** Headless doc for test strips — same raster path as Print. */
export function buildDiagnosticCompactLabelDocument(
  lines: readonly string[],
  widthMm = DIAGNOSTIC_COMPACT_LABEL_WIDTH_MM,
  heightMm = DIAGNOSTIC_COMPACT_LABEL_HEIGHT_MM,
  layout: { marginMm?: number; marginTopMm?: number; lineHeightMm?: number; fontPt?: number; maxLines?: number } = {},
): LabelDocument {
  const marginLeftMm = layout.marginMm ?? 1;
  const marginTopMm = layout.marginTopMm ?? layout.marginMm ?? 1;
  const lineHeightMm = layout.lineHeightMm ?? (heightMm <= 16 ? 4.2 : 5.5);
  const textWidthMm = Math.max(8, widthMm - marginLeftMm * 2);
  const fontPt = layout.fontPt ?? DEFAULT_TEXT_FONT_PT;
  const elements: LabelElement[] = lines
    .map((line) => String(line).trim())
    .filter((line) => line.length > 0)
    .slice(0, layout.maxLines ?? 4)
    .map((text, index) => ({
      id: generateId('diag'),
      type: 'text' as const,
      ...DEFAULT_ELEMENT_STATE,
      text,
      left: marginLeftMm,
      top: marginTopMm + index * lineHeightMm,
      width: textWidthMm,
      height: lineHeightMm,
      fontSize: fontPt,
      align: 'left' as const,
      autoWrapping: 'Close' as const,
      autoTextHeight: false,
      fontFamily: 'Default',
      needPrinting: true,
    }));
  return createLabelDocument({
    name: 'Diagnostic test label',
    widthMm,
    heightMm,
    paperType: 'Label',
    elements,
  });
}

export function bridgeLabelForTransport(transport: string | null | undefined): string {
  switch (transport) {
    case 'td404-spp':
      return 'TD-404 TSPL';
    case 'josh-lpapi':
      return 'Josh LPAPI';
    case 'tez-spp':
      return 'Tez / Shakti';
    case 'dev-spp':
      return 'Dev AutoReply';
    case 'labelx-spp':
      return 'Label X';
    case 'ble':
      return 'Bluetooth LE';
    case 'wifi':
      return 'Wi-Fi';
    case 'bluetooth-spp':
      return 'Bluetooth SPP';
    default:
      return transport?.trim() ? transport : 'Unknown bridge';
  }
}

function bridgeLabelFromStore(transport: PrinterTransport | null, sdkId: string | null): string {
  switch (transport) {
    case 'bluetooth-spp':
      return 'TD-404 TSPL';
    case 'josh-lpapi':
      return 'Josh LPAPI';
    case 'tez-spp':
      return 'Tez / Shakti';
    case 'dev-spp':
      return 'Dev AutoReply';
    case 'labelx-spp':
      return 'Label X';
    case 'bluetooth-ble':
      return 'Bluetooth LE';
    case 'wifi':
      return 'Wi-Fi';
    default:
      break;
  }
  switch (sdkId) {
    case 'td404':
      return 'TD-404 TSPL';
    case 'josh':
      return 'Josh LPAPI';
    case 'tez':
      return 'Tez / Shakti';
    case 'dev':
      return 'Dev AutoReply';
    case 'labelx':
      return 'Label X';
    default:
      return 'Unknown bridge';
  }
}

/** Short lines for 50×15 mm and 25×25 mm strips — left-aligned, small type. */
export function buildDiagnosticTestLabelLines(activeTransport?: string | null): string[] {
  const store = usePrinterStore.getState();
  const modelShort = (CONSUMER_PRINTERS[store.selectedPrinterModel] ?? CONSUMER_PRINTERS.tejas).shortName;
  const rawName = store.deviceName?.trim() || modelShort;
  const name = rawName.length > 22 ? `${rawName.slice(0, 20)}…` : rawName;
  const bridge =
    activeTransport != null
      ? bridgeLabelForTransport(activeTransport)
      : bridgeLabelFromStore(store.transport, store.sdkId);
  const bridgeShort = bridge.length > 24 ? `${bridge.slice(0, 22)}…` : bridge;
  return ['Test print by Sez Print', 'Software by Seznik India', `for ${name}`, bridgeShort];
}

export function buildDiagnosticTestLabelText(activeTransport?: string | null): string {
  return buildDiagnosticTestLabelLines(activeTransport).join('\n');
}
