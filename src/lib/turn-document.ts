import { scaleElementFields } from '@/lib/element-sizing';
import type { LabelDocument, LabelElement } from '@/lib/label-document';

export type ContentTurn = 0 | 90 | 180 | 270;

/** Scale that keeps a label's contents inside the label after a quarter turn. 1 for 0 / 180. */
export function contentTurnFit(widthMm: number, heightMm: number, deg: ContentTurn): number {
  if (deg !== 90 && deg !== 270) return 1;
  const w = Math.max(widthMm, 0.01);
  const h = Math.max(heightMm, 0.01);
  return Math.min(w / h, h / w);
}

/**
 * Turn what is printed on the label while the label itself (size, shape, border) stays put.
 * Every element swings clockwise by `deg` about the label centre and, on a quarter turn, shrinks by
 * `contentTurnFit` so it still lies inside the label. The result is an ordinary un-turned job, so
 * every printer path prints it as it is, and the preview shows the same document.
 */
export function turnDocumentContents(doc: LabelDocument, deg: ContentTurn): LabelDocument {
  if (deg === 0 || doc.ups || doc.upsTile) return doc;
  const W = doc.widthMm;
  const H = doc.heightMm;
  const s = contentTurnFit(W, H, deg);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  const cx = W / 2;
  const cy = H / 2;
  const elements = doc.elements.map((el): LabelElement => {
    // Borders belong to the label, not to what is printed on it.
    if (el.type === 'border') return el;
    const scaled = s === 1 ? el : scaleElementFields(el, s, s, s, W, H);
    const h = typeof scaled.height === 'number' ? scaled.height : scaled.width;
    // Offset of the element centre from the centre of the (scaled) content, then swung.
    const dx = scaled.left + scaled.width / 2 - cx * s;
    const dy = scaled.top + h / 2 - cy * s;
    const nx = cx + dx * cos - dy * sin;
    const ny = cy + dx * sin + dy * cos;
    return {
      ...scaled,
      left: nx - scaled.width / 2,
      top: ny - h / 2,
      rotation: (((scaled.rotation ?? 0) + deg) % 360 + 360) % 360,
    } as LabelElement;
  });
  return { ...doc, elements };
}
