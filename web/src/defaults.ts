import {
  DEFAULT_ARCTEXT_STATE,
  DEFAULT_BARCODE_STATE,
  DEFAULT_DEGREES_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
  DEFAULT_TIME_STATE,
  createTableState,
} from '@/components/editor/types';

export type El = Record<string, any> & { id: string; type: string };

let n = 0;
export const newId = (prefix = 'el') => `${prefix}_${Date.now().toString(36)}_${(n += 1).toString(36)}`;

/** The element menu of the phone editor. `web: false` means it needs the phone. */
export const TOOLS: Array<{ id: string; label: string; web: boolean; note?: string }> = [
  { id: 'text', label: 'Text', web: true },
  { id: 'barcode', label: 'Barcode', web: true },
  { id: 'qrcode', label: 'QRCode', web: true },
  { id: 'image', label: 'Image', web: true },
  { id: 'clipart', label: 'Clipart', web: true },
  { id: 'line', label: 'Line', web: true },
  { id: 'shape', label: 'Shapes', web: true },
  { id: 'table', label: 'Table', web: true },
  { id: 'time', label: 'Time', web: true },
  { id: 'arctext', label: 'ArcText', web: true },
  { id: 'degrees', label: 'Serial', web: true },
  { id: 'border', label: 'Border', web: true },
  { id: 'signature', label: 'Signature', web: true },
  { id: 'excel', label: 'Excel', web: false, note: 'Spreadsheet import runs on the phone.' },
  { id: 'scan', label: 'Scan', web: false, note: 'Camera scan runs on the phone.' },
  { id: 'ocr', label: 'OCR', web: false, note: 'OCR runs on the phone.' },
  { id: 'emoji', label: 'Line Emoji', web: false, note: 'The emoji library ships inside the phone app.' },
  { id: 'clone', label: 'Label Clone', web: false, note: 'Needs the phone camera.' },
];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** A new element with the same defaults the phone gives, placed at (left, top) mm. */
export function createElement(type: string, labelW: number, labelH: number, at: { left: number; top: number }, extra: Record<string, unknown> = {}): El {
  const base = { id: newId(), type, left: at.left, top: at.top };
  const fit = (w: number, h: number) => ({ width: Math.min(w, Math.max(2, labelW - at.left - 0.5)), height: Math.min(h, Math.max(2, labelH - at.top - 0.5)) });
  switch (type) {
    case 'text':
      return { ...clone(DEFAULT_ELEMENT_STATE), ...base, text: 'Text', width: Math.min(30, labelW - at.left - 0.5), autoTextHeight: true, ...extra } as El;
    case 'barcode':
      return { ...clone(DEFAULT_BARCODE_STATE), ...base, content: '1234567890', ...fit(26, 10), ...extra } as El;
    case 'qrcode':
      return { ...clone(DEFAULT_QRCODE_STATE), ...base, ...fit(12, 12), ...extra } as El;
    case 'line':
      return { ...clone(DEFAULT_LINE_STATE), ...base, width: Math.min(30, labelW - at.left - 0.5), ...extra } as El;
    case 'shape':
      return { ...clone(DEFAULT_SHAPE_STATE), ...base, ...fit(20, 12), ...extra } as El;
    case 'table': {
      const t = createTableState(2, 3);
      const w = Math.min(t.width, labelW - at.left - 0.5);
      const h = Math.min(t.height, labelH - at.top - 0.5);
      return {
        ...clone(t), ...base, width: w, height: h,
        rowHeights: [h / 2, h / 2], columnWidths: [w / 3, w / 3, w / 3], ...extra,
      } as El;
    }
    case 'time':
      return { ...clone(DEFAULT_TIME_STATE), ...base, width: Math.min(32, labelW - at.left - 0.5), ...extra } as El;
    case 'arctext':
      return { ...clone(DEFAULT_ARCTEXT_STATE), ...base, text: 'ARC TEXT', ...fit(20, 20), ...extra } as El;
    case 'degrees':
      return {
        ...clone(DEFAULT_DEGREES_STATE), ...base, width: Math.min(30, labelW - at.left - 0.5),
        serial: { v: 1, id: newId('ser'), kind: 'number', start: '1', step: '1', minWidth: 3 }, content: '001', ...extra,
      } as El;
    case 'border':
      return {
        ...base, left: 2, top: 2, width: labelW - 4, height: labelH - 4, borderStyle: 'solid-medium', lineWidth: 0.5,
        rotation: 0, lockMovement: true, needPrinting: true, drawingColorIndex: 1, geometryVersion: 1, ...extra,
      } as El;
    case 'image':
      return { ...base, rotation: 0, lockMovement: false, needPrinting: true, antiColor: false, contentFit: 'contain', aspectRatioLocked: true, uri: '', printUri: '', ...fit(20, 20), ...extra } as El;
    case 'clipart':
      return { ...base, rotation: 0, lockMovement: false, needPrinting: true, drawingColorIndex: 1, clipartId: 'builtin', ...fit(10, 10), ...extra } as El;
    case 'signature':
      return { ...base, rotation: 0, lockMovement: false, needPrinting: true, drawingColorIndex: 1, strokes: [], ...fit(20, 10), ...extra } as El;
    default:
      throw new Error(`Unknown element type ${type}`);
  }
}
