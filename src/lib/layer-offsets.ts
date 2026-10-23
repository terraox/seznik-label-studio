/**
 * Print-page "Elements offset" and "Border offset" (mm, +x right, +y down, same frame as the
 * existing H/V offset). They ADD to every baked-in offset and default to 0, so a label that
 * never set them prints exactly as before. TD-404 and Josh only: they are the bridges whose
 * headless raster draws the border as its own layer.
 */
import type { LabelDocument, LabelElement, LabelOrientation } from '@/lib/label-document';
import { resolveLabelSettings } from '@/lib/label-settings';
import { joshBorderGapMm, JOSH_BORDER_CENTER_GAP_MM, JOSH_BORDER_SHIFT_MM } from '@/lib/printer/josh-print';
import { dotsPerMm, td404BorderGapMm, td404BorderOuterDots, TD404_BORDER_SHIFT_MM } from '@/lib/printer/print-spec';
import { borderShapeForMedia } from '@/printing/raster/border-shapes';
import { borderCoversBitmap, borderStrokeMmOf } from '@/printing/raster/print-border';

export type OffsetMm = { x: number; y: number };
export type LayerOffsetsMm = { elements: OffsetMm; border: OffsetMm };
export type LayerBridge = 'td404' | 'josh';

export const ZERO_LAYER_OFFSETS: LayerOffsetsMm = {
  elements: { x: 0, y: 0 },
  border: { x: 0, y: 0 },
};

export const LAYER_OFFSET_MIN_MM = -10;
export const LAYER_OFFSET_MAX_MM = 10;
export const LAYER_OFFSET_STEP_MM = 0.5;

function finiteOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function clampLayerOffsetMm(mm: number): number {
  const v = Math.min(LAYER_OFFSET_MAX_MM, Math.max(LAYER_OFFSET_MIN_MM, finiteOr0(mm)));
  return Math.round(v * 100) / 100;
}

/** Saved offsets of a label. Labels saved before this feature have none: missing means 0. */
export function layerOffsetsOf(doc: LabelDocument | null | undefined): LayerOffsetsMm {
  if (!doc) return ZERO_LAYER_OFFSETS;
  const s = resolveLabelSettings(doc);
  return {
    elements: { x: finiteOr0(s.elementsOffsetXMm), y: finiteOr0(s.elementsOffsetYMm) },
    border: { x: finiteOr0(s.borderOffsetXMm), y: finiteOr0(s.borderOffsetYMm) },
  };
}

export function isOffsetBorder(el: LabelElement): el is Extract<LabelElement, { type: 'border' }> {
  return el.type === 'border' && el.needPrinting !== false && el.visible !== false && (el.rotation ?? 0) % 360 === 0;
}

/**
 * True when the label has a border the border layer can move. Josh only draws a rectangular
 * die-cut border as its own layer; any other border is drawn with the elements.
 */
export function labelHasOffsetBorder(doc: LabelDocument | null | undefined, bridge: LayerBridge): boolean {
  if (!doc) return false;
  if (bridge === 'josh' && borderShapeForMedia(doc.upsTile?.shape ?? doc.mediaShape) !== 'rect') return false;
  return doc.elements.some(isOffsetBorder);
}

/**
 * The offsets that are actually applied. With no border the Print screen shows one plain offset
 * (the printer offset), so neither layer offset applies; a border this printer cannot move on its
 * own keeps only the elements offset.
 */
export function effectiveLayerOffsets(
  doc: LabelDocument | null | undefined,
  offsets: LayerOffsetsMm,
  bridge: LayerBridge,
): LayerOffsetsMm {
  if (!doc?.elements.some(isOffsetBorder)) return ZERO_LAYER_OFFSETS;
  return labelHasOffsetBorder(doc, bridge) ? offsets : { elements: offsets.elements, border: { x: 0, y: 0 } };
}

/** Printable content other than the border the border offset moves. */
export function labelHasOffsetElements(doc: LabelDocument | null | undefined): boolean {
  return doc?.elements.some((el) => !isOffsetBorder(el) && el.needPrinting !== false && el.visible !== false) ?? false;
}

/** A label-frame offset expressed in the paper frame of a label turned by `deg` (clockwise). */
export function offsetToPaperFrame(o: OffsetMm, deg: LabelOrientation): OffsetMm {
  if (deg === 90) return { x: -o.y, y: o.x };
  if (deg === 270) return { x: o.y, y: -o.x };
  if (deg === 180) return { x: -o.x, y: -o.y };
  return o;
}

/**
 * Preview only: the label with both offsets drawn in. The printed bitmap is shifted in dots
 * instead (its document is never edited, so border placement rules stay as they were).
 */
export function previewWithLayerOffsets(
  doc: LabelDocument,
  offsets: LayerOffsetsMm,
  bridge: LayerBridge,
): LabelDocument {
  const eff = effectiveLayerOffsets(doc, offsets, bridge);
  const moveE = eff.elements.x !== 0 || eff.elements.y !== 0;
  const moveB = eff.border.x !== 0 || eff.border.y !== 0;
  if (!moveE && !moveB) return doc;
  return {
    ...doc,
    elements: doc.elements.map((el) => {
      const edge = isOffsetBorder(el);
      const d = edge ? eff.border : eff.elements;
      if (d.x === 0 && d.y === 0) return el;
      return { ...el, left: el.left + d.x, top: el.top + d.y } as LabelElement;
    }),
  };
}

/**
 * Warning text when a user offset pushes ink past the label edge (null when it does not).
 * It is a check on boxes, not on pixels. Printing still goes ahead: ink past the edge is cut.
 * `elementsBakedMm` is everything already moving the elements (printer offset plus the
 * bridge's fixed shift).
 */
export function layerOffsetWarning(args: {
  doc: LabelDocument | null | undefined;
  bridge: LayerBridge;
  offsets: LayerOffsetsMm;
  elementsBakedMm: OffsetMm;
  dpi: number;
}): string | null {
  const { doc, bridge, dpi } = args;
  if (!doc) return null;
  const eff = effectiveLayerOffsets(doc, args.offsets, bridge);
  const parts: string[] = [];

  const e = eff.elements;
  if (e.x !== 0 || e.y !== 0) {
    const base = args.elementsBakedMm;
    const t = { x: base.x + e.x, y: base.y + e.y };
    // Only what the user's offset made worse counts: an element already at the edge is not news.
    const worse = doc.elements.some((el) => {
      if (el.type === 'border' || el.needPrinting === false || el.visible === false) return false;
      const over = (d: OffsetMm) =>
        Math.max(
          0,
          -(el.left + d.x),
          -(el.top + d.y),
          el.left + d.x + el.width - doc.widthMm,
          el.top + d.y + (el.height ?? 0) - doc.heightMm,
        );
      return over(t) > over(base) + 0.01;
    });
    if (worse) parts.push('Some elements');
  }

  const b = eff.border;
  if ((b.x !== 0 || b.y !== 0) && borderPastEdge(doc, bridge, b, dpi)) parts.push('The border');

  if (parts.length === 0) return null;
  return `${parts.join(' and ')} will go past the label edge and be cut off. It still prints.`;
}

function borderPastEdge(doc: LabelDocument, bridge: LayerBridge, user: OffsetMm, dpi: number): boolean {
  const dpm = dotsPerMm(dpi);
  const wDots = Math.round(doc.widthMm * dpm);
  const hDots = Math.round(doc.heightMm * dpm);
  const fixed = bridge === 'josh' ? JOSH_BORDER_SHIFT_MM : TD404_BORDER_SHIFT_MM;
  return doc.elements.filter(isOffsetBorder).some((el) => {
    let left: number;
    let right: number;
    let top: number;
    let bottom: number;
    if (!borderCoversBitmap(el, dpi, wDots, hDots)) {
      left = el.left;
      top = el.top;
      right = doc.widthMm - (el.left + el.width);
      bottom = doc.heightMm - (el.top + el.height);
    } else if (bridge === 'td404') {
      const o = td404BorderOuterDots(wDots, hDots, dpi, td404BorderGapMm(el.edgeGapMm), borderStrokeMmOf(el));
      left = o.x0 / dpm;
      top = o.y0 / dpm;
      right = (wDots - o.x1) / dpm;
      bottom = (hDots - o.y1) / dpm;
    } else {
      const gap = el.edgeGapMm != null ? joshBorderGapMm(el.edgeGapMm) : JOSH_BORDER_CENTER_GAP_MM;
      left = right = top = bottom = Math.max(0, gap - borderStrokeMmOf(el) / 2);
    }
    // Smallest gap left to the edge, with and without the user's offset.
    const room = (sx: number, sy: number) => Math.min(left + sx, right - sx, top + sy, bottom - sy);
    return room(fixed.x + user.x, fixed.y + user.y) < -0.01 && room(fixed.x + user.x, fixed.y + user.y) < room(fixed.x, fixed.y) - 0.01;
  });
}
