import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
} from '@/components/editor/types';
import { textBlockHeightMm } from '@/lib/element-sizing';
import { generateId, type LabelElement } from '@/lib/label-document';
import { cleanSampleLayout, type SampleElement } from '@/lib/template-sample';

/** Turns the admin's sample content into real, editable label elements (mm positions are kept as designed). */
export function sampleToElements(layout: unknown, widthMm: number, heightMm: number): LabelElement[] {
  const checked = cleanSampleLayout(layout, widthMm, heightMm);
  if (!checked.ok) return [];
  return checked.layout.map((s: SampleElement): LabelElement => {
    const frame = { id: generateId(), left: s.left, top: s.top, width: s.width };
    switch (s.type) {
      case 'text': {
        const text = s.text ?? '';
        const fontSize = s.fontSize ?? 8;
        return {
          ...DEFAULT_ELEMENT_STATE,
          ...frame,
          type: 'text',
          text,
          fontSize,
          bold: s.bold === true,
          align: s.align ?? 'left',
          height: textBlockHeightMm(fontSize, text.split('\n').length),
          drawingColorIndex: 1,
        };
      }
      case 'barcode':
        return { ...DEFAULT_BARCODE_STATE, ...frame, type: 'barcode', content: s.text || DEFAULT_BARCODE_STATE.content, height: s.height, drawingColorIndex: 1 };
      case 'qrcode':
        return { ...DEFAULT_QRCODE_STATE, ...frame, type: 'qrcode', content: s.text || DEFAULT_QRCODE_STATE.content, height: s.height };
      default:
        return { ...DEFAULT_LINE_STATE, ...frame, type: 'line', height: s.height };
    }
  });
}
