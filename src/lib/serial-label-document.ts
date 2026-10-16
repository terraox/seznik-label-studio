import { createBulkLabelDocument } from '@/lib/bulk-labels';
import { clampLabelMm } from '@/lib/label-geometry';
import type { LabelDocument, LabelOrientation, PaperType } from '@/lib/label-document';
import type {
  BarcodeSymbology,
  GeneratedLabel,
} from '@/lib/printer/SerialLabelEngine';
import type { ExcelSheet } from '@/stores/data-store';

export function serialBarcodeEncodeMode(symbology: BarcodeSymbology): string {
  switch (symbology) {
    case 'CODE39':
      return 'CODE-39';
    case 'EAN13':
      return 'EAN-13';
    case 'UPCA':
      return 'UPC-A';
    default:
      return 'CODE-128';
  }
}

export function serialSheetFromLabels(labels: GeneratedLabel[]): ExcelSheet {
  return {
    name: 'Serial',
    columns: ['Text', 'Barcode'],
    rows: labels.map((label) => [label.text, label.barcodeValue]),
  };
}

export function serialDocumentName(labels: GeneratedLabel[]): string {
  if (labels.length === 0) return 'Serial labels';
  const first = labels[0].text;
  const last = labels[labels.length - 1].text;
  if (first === last) return `Serial ${first}`;
  return `Serial ${first} → ${last}`;
}

export function createSerialLabelDocument(params: {
  labels: GeneratedLabel[];
  excelFileId: string;
  widthMm: number;
  heightMm: number;
  barcodeSymbology: BarcodeSymbology;
  orientation?: LabelOrientation;
  paperType?: PaperType;
}): LabelDocument | null {
  if (params.labels.length === 0) return null;
  const size = clampLabelMm(params.widthMm, params.heightMm);
  const sheet = serialSheetFromLabels(params.labels);
  return createBulkLabelDocument({
    name: serialDocumentName(params.labels),
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    orientation: params.orientation,
    paperType: params.paperType ?? 'Label',
    excelFileId: params.excelFileId,
    sheetIndex: 0,
    sheet,
    mappings: [
      { columnIndex: 0, include: true, kind: 'text' },
      { columnIndex: 1, include: true, kind: 'barcode' },
    ],
    barcodeEncodeMode: serialBarcodeEncodeMode(params.barcodeSymbology),
  });
}
