import { gs1Payload } from '@/lib/barcode-code128';

/** Human-readable barcode text. Retail modes show the digits actually encoded (padded, check digit added). */
export function formatBarcodeHri(mode: string, content: string): string {
  const length = mode === 'UPC-A' ? 12 : mode === 'EAN-13' ? 13 : mode === 'EAN-8' ? 8 : 0;
  if (!length) return content;
  const digits = gs1Payload(content, length);
  if (!digits) return content;
  if (mode === 'UPC-A') return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`;
  return digits;
}
