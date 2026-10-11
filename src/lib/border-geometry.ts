import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { PRINT_BORDER_INSET_MM } from '@/printing/raster/border-frame';

const MIN_BORDER_MM = 1;

/**
 * Shift a stored border box inward by the 2 mm margin on each side.
 * Width and height never drop below 1 mm. When the result still fits in the
 * label, the origin is pulled back inside. A box larger than the label (a
 * border left at the old size after keep-resize) keeps the shifted size
 * instead of being rewritten to the new label.
 */
export function insetBorderBox(
  left: number,
  top: number,
  width: number,
  height: number,
  limitW: number,
  limitH: number,
): { left: number; top: number; width: number; height: number } {
  const axis = (origin: number, size: number, limit: number) => {
    let nextSize = size - PRINT_BORDER_INSET_MM * 2;
    let nextOrigin = origin + PRINT_BORDER_INSET_MM;
    if (!(nextSize >= MIN_BORDER_MM)) nextSize = MIN_BORDER_MM;
    if (Number.isFinite(limit) && nextSize <= limit) {
      if (nextOrigin < 0) nextOrigin = 0;
      if (nextOrigin + nextSize > limit) nextOrigin = Math.max(0, limit - nextSize);
    } else if (nextOrigin < 0) {
      nextOrigin = 0;
    }
    return { origin: nextOrigin, size: nextSize };
  };
  const x = axis(left, width, limitW);
  const y = axis(top, height, limitH);
  return { left: x.origin, top: y.origin, width: x.size, height: y.size };
}

/**
 * Rectangle (outer edge, geometryVersion 1) whose stroke CENTER is `gapMm` from every
 * label edge: the outer edge sits half a stroke closer to the edge than the center.
 */
export function borderBoxForCenterGap(
  widthMm: number,
  heightMm: number,
  gapMm: number,
  strokeMm: number,
): { left: number; top: number; width: number; height: number } {
  const maxInset = Math.max(0, (Math.min(widthMm, heightMm) - MIN_BORDER_MM) / 2);
  const inset = Math.min(maxInset, Math.max(0, gapMm - strokeMm / 2));
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    left: round(inset),
    top: round(inset),
    width: round(widthMm - inset * 2),
    height: round(heightMm - inset * 2),
  };
}

/** New locked border: the 2 mm margin is already inside the rectangle. */
export function defaultBorderPlacement(widthMm: number, heightMm: number): {
  left: number;
  top: number;
  width: number;
  height: number;
  geometryVersion: 1;
  lockMovement: true;
  rotation: 0;
} {
  return {
    ...insetBorderBox(0, 0, widthMm, heightMm, widthMm, heightMm),
    geometryVersion: 1,
    lockMovement: true,
    rotation: 0,
  };
}

export function migrateBorderElement<T extends LabelElement & { type: 'border' }>(
  el: T,
  limitW: number,
  limitH: number,
): T {
  if (el.geometryVersion === 1) return el;
  const rect = insetBorderBox(el.left, el.top, el.width, el.height, limitW, limitH);
  return {
    ...el,
    ...rect,
    geometryVersion: 1,
    rotation: 0,
    lockMovement: true,
  };
}

export function migrateElementsForLabel(
  elements: LabelElement[],
  limitW: number,
  limitH: number,
): LabelElement[] {
  let changed = false;
  const next = elements.map((el) => {
    if (el.type !== 'border') return el;
    const migrated = migrateBorderElement(el, limitW, limitH);
    if (migrated !== el) changed = true;
    return migrated;
  });
  return changed ? next : elements;
}

/** Migrate every border on the document and on each multi-up panel (panel size). */
export function migrateDocumentBorders(doc: LabelDocument): LabelDocument {
  const elements = migrateElementsForLabel(doc.elements, doc.widthMm, doc.heightMm);
  const panels = doc.ups
    ? doc.ups.panels.map((panel) => migrateElementsForLabel(panel, doc.widthMm, doc.heightMm))
    : undefined;
  const panelsChanged = Boolean(
    panels && doc.ups && panels.some((panel, i) => panel !== doc.ups!.panels[i]),
  );
  if (elements === doc.elements && !panelsChanged) return doc;
  return {
    ...doc,
    elements,
    ups: doc.ups && panels ? { ...doc.ups, panels } : doc.ups,
  };
}
