import { clampGridSpacingMm } from '@/lib/editor/canvas-grid';
import { elementSizeMm, type LabelDocument } from '@/lib/label-document';
import { dotsPerMm, mmToDots, rectMmToDots } from '@/lib/printer/print-spec';

/** Printed grid line thickness — at least 2 dots so horizontals read solid on 203 DPI heads. */
export const PRINT_GRID_LINE_MM = 0.4;

export function printGridLineDots(dpi: number): number {
  return Math.max(2, mmToDots(PRINT_GRID_LINE_MM, dpi));
}

export type GridRect = { left: number; top: number; width: number; height: number };

/** Grid spacing in mm when the label prints a grid, otherwise null. */
export function printGridSpacingMm(doc: Pick<LabelDocument, 'settings'>): number | null {
  if (!doc.settings?.printGrid) return null;
  return clampGridSpacingMm(doc.settings.printGridSpacingMm ?? 5);
}

/**
 * The four strips of a border's frame (mm). Only these are covered, never the area inside:
 * a border's box spans the whole label, so using the box would erase the grid it frames.
 * The strip is a little wider than the stroke so ornate frames are covered too.
 */
export function borderRingRectsMm(el: {
  left: number;
  top: number;
  width: number;
  height: number;
  lineWidth?: number;
}): GridRect[] {
  const thickness = Math.min(3, Math.max(0.8, (el.lineWidth ?? 0.4) * 3));
  const t = Math.min(thickness, el.width / 2, el.height / 2);
  const innerH = Math.max(0, el.height - 2 * t);
  return [
    { left: el.left, top: el.top, width: el.width, height: t },
    { left: el.left, top: el.top + el.height - t, width: el.width, height: t },
    { left: el.left, top: el.top + t, width: t, height: innerH },
    { left: el.left + el.width - t, top: el.top + t, width: t, height: innerH },
  ];
}

/**
 * The one list of areas elements cover on the grid, shared by the editor grid plates and the
 * printed grid so "grid", "print grid" and both together always agree. A border covers only
 * its frame strips. `includeNonPrinting` is for the editor, where such elements are still drawn.
 */
export function gridCoverRectsMm(
  elements: LabelDocument['elements'],
  options: { includeNonPrinting?: boolean } = {},
): { id: string; rect: GridRect }[] {
  const out: { id: string; rect: GridRect }[] = [];
  for (const el of elements) {
    if (el.visible === false) continue;
    if (el.needPrinting === false && !options.includeNonPrinting) continue;
    const size = elementSizeMm(el);
    if (el.type === 'border') {
      for (const rect of borderRingRectsMm({ ...el, ...size })) out.push({ id: el.id, rect });
      continue;
    }
    out.push({ id: el.id, rect: { left: el.left, top: el.top, width: size.width, height: size.height } });
  }
  return out;
}

/** Element areas (mm) the printed grid stays out of. */
export function printGridKnockoutsMm(doc: Pick<LabelDocument, 'elements'>): GridRect[] {
  return gridCoverRectsMm(doc.elements).map((item) => item.rect);
}

/** Line positions in mm, every `spacingMm` from the label's top-left, edges excluded. */
export function printGridLinesMm(widthMm: number, heightMm: number, spacingMm: number) {
  const step = clampGridSpacingMm(spacingMm);
  const countX = Math.floor((widthMm - 1e-6) / step);
  const countY = Math.floor((heightMm - 1e-6) / step);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 1; i <= countX; i++) xs.push(i * step);
  for (let i = 1; i <= countY; i++) ys.push(i * step);
  return { xs, ys };
}

/** Removes the parts of a full-length grid line that cross any hole. */
function cutLine(line: GridRect, vertical: boolean, holes: GridRect[]): GridRect[] {
  const start = vertical ? line.top : line.left;
  const end = start + (vertical ? line.height : line.width);
  const cuts = holes
    .filter((h) =>
      vertical
        ? h.left < line.left + line.width && h.left + h.width > line.left
        : h.top < line.top + line.height && h.top + h.height > line.top,
    )
    .map((h) => (vertical ? [h.top, h.top + h.height] : [h.left, h.left + h.width]))
    .sort((a, b) => a[0] - b[0]);
  const out: GridRect[] = [];
  const push = (a: number, b: number) => {
    if (b <= a) return;
    out.push(vertical ? { ...line, top: a, height: b - a } : { ...line, left: a, width: b - a });
  };
  let pos = start;
  for (const [a, b] of cuts) {
    if (a > pos) push(pos, Math.min(a, end));
    pos = Math.max(pos, b);
    if (pos >= end) return out;
  }
  push(pos, end);
  return out;
}

export type GridPageUnits = { width: number; height: number };

/** Grid line rectangles in any whole-unit space, with `holes` (same units) cut out. */
export function gridRects(
  widthMm: number,
  heightMm: number,
  spacingMm: number,
  unitsPerMm: number,
  lineUnits: number,
  holes: GridRect[] = [],
  pageUnits?: GridPageUnits,
): GridRect[] {
  const pageW = Math.max(1, pageUnits?.width ?? Math.round(widthMm * unitsPerMm));
  const pageH = Math.max(1, pageUnits?.height ?? Math.round(heightMm * unitsPerMm));
  const t = Math.max(1, lineUnits);
  const half = Math.floor(t / 2);
  const { xs, ys } = printGridLinesMm(widthMm, heightMm, spacingMm);
  return [
    ...xs.flatMap((mm) => {
      const left = Math.round(mm * unitsPerMm) - half;
      return cutLine({ left, top: 0, width: t, height: pageH }, true, holes);
    }),
    ...ys.flatMap((mm) => {
      const top = Math.min(Math.max(0, Math.round(mm * unitsPerMm) - half), pageH - t);
      return cutLine({ left: 0, top, width: pageW, height: t }, false, holes);
    }),
  ];
}

/** Grid lines as whole-dot rectangles over the full label (0,0 = label top-left). */
export function printGridRectsDots(
  widthMm: number,
  heightMm: number,
  spacingMm: number,
  dpi: number,
  knockoutsMm: GridRect[] = [],
  pageDots?: GridPageUnits,
): GridRect[] {
  const holes = knockoutsMm.map((k) => {
    const r = rectMmToDots(k.left, k.top, k.width, k.height, dpi);
    return { left: r.x0, top: r.y0, width: r.widthDots, height: r.heightDots };
  });
  return gridRects(
    widthMm,
    heightMm,
    spacingMm,
    dotsPerMm(dpi),
    printGridLineDots(dpi),
    holes,
    pageDots,
  );
}

export function gridRectsToPath(rects: GridRect[], dx = 0, dy = 0): string {
  let d = '';
  for (const r of rects) {
    d += `M${r.left + dx} ${r.top + dy}h${r.width}v${r.height}h${-r.width}z`;
  }
  return d;
}
