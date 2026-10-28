export type ScanResult = {
  type: string;
  data: string;
};

export type OcrResultType = 'Text' | 'Barcode' | 'QRCode';

export type OcrResult = {
  type: OcrResultType;
  data: string;
};

export type ClipartResult = {
  id: string;
};

export type BorderResult =
  | { remove: true }
  | {
      style: import('@/constants/border-library').BorderStyleId;
      lineWidth: number;
      edgeGapMm: number;
    };

export function isBorderRemoval(result: BorderResult): result is { remove: true } {
  return 'remove' in result && result.remove;
}

export type ImageCropMode = 'import' | 'replace' | 'recrop';

export type ImageCropResult = {
  uri: string;
  width: number;
  height: number;
  mode: ImageCropMode;
  elementId?: string;
  crop?: import('@/lib/editor/image-crop-math').NormalizedCrop;
};

/** Where a returning Scan / OCR / ASR result should land in the editor. */
export type ScanConsumer =
  | { kind: 'tableCell'; tableId: string; row: number; col: number }
  | { kind: 'element'; elementId: string };

export const editorBridge = {
  columnNameResult: null as string | null,
  columnNameConsumer: null as 'qrcode' | 'arctext' | 'degrees' | 'text' | 'barcode' | 'image' | null,
  scanResult: null as ScanResult | null,
  /**
   * Stashed before navigating to /scan (or OCR/ASR). Survives an edit-screen remount so a
   * table-cell Content scan writes into that cell instead of spawning a new barcode/QR.
   */
  scanConsumer: null as ScanConsumer | null,
  ocrResult: null as OcrResult | null,
  asrResult: null as OcrResult | null,
  clipartResult: null as ClipartResult | null,
  borderResult: null as BorderResult | null,
  fontResult: null as string | null,
  /** Set when picking a data file from Label Settings. */
  dataSourceFileId: null as string | null,
  /** Latest in-editor document snapshot for label-settings when store is stale. */
  labelSettingsDoc: null as import('@/lib/label-document').LabelDocument | null,
  imageCropResult: null as ImageCropResult | null,
};

export function isQrScanType(type: string) {
  const normalized = type.toLowerCase().replace(/[_-\s]/g, '');
  return (
    normalized.includes('qr') ||
    normalized.includes('aztec') ||
    normalized.includes('datamatrix') ||
    normalized.includes('pdf417')
  );
}

export function barcodeEncodeModeForScanType(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes('ean13')) return 'EAN-13';
  if (normalized.includes('ean8')) return 'EAN-8';
  if (normalized.includes('upc')) return 'UPC-A';
  if (normalized.includes('code39')) return 'CODE-39';
  if (normalized.includes('itf')) return 'ITF';
  return 'CODE-128';
}
