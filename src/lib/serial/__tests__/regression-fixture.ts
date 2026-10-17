import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
} from '@/components/editor/types';
import { createLabelDocument, type LabelDocument, type LabelElement } from '@/lib/label-document';

/** A label with no serial config: text, barcode and QR (the types the headless Skia path draws). Must print identically forever. */
export function nonSerialFixture(): LabelDocument {
  const elements = [
    { ...DEFAULT_ELEMENT_STATE, id: 't1', type: 'text', text: 'Hello 12', left: 2, top: 2, width: 30, fontSize: 10 },
    { ...DEFAULT_ELEMENT_STATE, id: 't2', type: 'text', text: 'SN015', contentType: 'Degrees', degreesOffset: 1, left: 2, top: 10, width: 30, fontSize: 10 },
    { ...DEFAULT_BARCODE_STATE, id: 'b1', type: 'barcode', content: '12345678', left: 2, top: 18, width: 40, height: 10 },
    { ...DEFAULT_QRCODE_STATE, id: 'q1', type: 'qrcode', content: 'https://seznik.in', left: 36, top: 2, width: 12, height: 12 },
  ] as unknown as LabelElement[];
  const doc = createLabelDocument({ name: 'fixture', widthMm: 50, heightMm: 32, elements });
  return { ...doc, id: 'fixture', createdAt: 0, updatedAt: 0 };
}

/** FNV-1a over bytes, as hex. */
export function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
