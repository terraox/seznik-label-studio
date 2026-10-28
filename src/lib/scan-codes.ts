import type { BarcodeScanningResult, BarcodeType } from 'expo-camera';

export const SCAN_CODE_TYPES: BarcodeType[] = [
  'qr',
  'ean13',
  'ean8',
  'code128',
  'code39',
  'code93',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
  'pdf417',
  'aztec',
  'datamatrix',
];

export function payloadFromBarcodeResult(result: BarcodeScanningResult): { type: string; data: string } | null {
  const extra = result as BarcodeScanningResult & { raw?: string; extra?: { raw?: string } };
  const data = String(result.data ?? extra.raw ?? extra.extra?.raw ?? '').trim();
  if (!data) return null;
  return { type: String(result.type || 'unknown'), data };
}

export function isScanEmptyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /no usable data|not found|nothing detected|no barcode/i.test(message);
}

const SCAN_TYPE_NAMES: Record<string, string> = {
  qr: 'QR Code',
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
  code128: 'Code 128',
  code39: 'Code 39',
  code93: 'Code 93',
  itf14: 'ITF-14',
  codabar: 'Codabar',
  pdf417: 'PDF417',
  aztec: 'Aztec',
  datamatrix: 'Data Matrix',
  manual: 'Typed',
};

/** Readable name for an expo-camera code type, e.g. 'upc_a' -> 'UPC-A'. */
export function scanTypeName(type: string): string {
  const key = String(type ?? '').toLowerCase();
  return SCAN_TYPE_NAMES[key] ?? (key ? key.toUpperCase() : 'Code');
}

export function isScanUrl(data: string): boolean {
  return /^https?:\/\/\S+$/i.test(data.trim());
}
