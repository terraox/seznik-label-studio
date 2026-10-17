import { resolveBorderStyle } from '@/constants/border-library';
import type { LabelElement } from '@/lib/label-document';
import { borderShapeForMedia } from '@/printing/raster/border-shapes';
import { mmToDots, td404BorderGapMm, td404BorderOuterDots } from '@/lib/printer/print-spec';
import {
  borderFrameInsetsForElement,
  borderInsetDots,
  borderStrokeDots,
  borderStrokeFallbackMm,
  drawInwardFrameInBox,
  type FrameFillTarget,
} from '@/printing/raster/border-frame';

export type DrawPrintBorderOpts = {
  /**
   * Packed bitmap size (the bytes that are sent). TSPL width is a multiple of 8,
   * so it can be 0–7 dots narrower than the label in millimetres.
   * Clip to that bitmap first, then inset.
   */
  bitmapWidthDots?: number;
  bitmapHeightDots?: number;
  /**
   * Extra bottom inset in millimetres. Off in production (0). Tests may pass 1
   * to model a tear clip; do not enable it on the print path without paper proof.
   */
  extraBottomInsetMm?: number;
  /** TD-404 only. Place the outer stroke from td404BorderOuterDots. */
  bakeFeed?: boolean;
  /** Label die-cut. Circle and ellipse labels print a ring instead of a rectangle. */
  mediaShape?: string;
};

/** A full-label frame sits within this of every page edge. A cell border does not. */
const PAGE_BORDER_SLACK_MM = 6;

/**
 * True when this border is the frame of the whole bitmap.
 * A 2-up cell border covers one half, so it must keep its own rectangle.
 */
export function borderCoversBitmap(
  el: { left: number; top: number; width: number; height: number },
  dpi: number,
  bitmapWidthDots: number,
  bitmapHeightDots: number,
): boolean {
  if (bitmapWidthDots <= 0 || bitmapHeightDots <= 0) return false;
  const slack = mmToDots(PAGE_BORDER_SLACK_MM, dpi);
  const x0 = mmToDots(el.left, dpi);
  const y0 = mmToDots(el.top, dpi);
  const x1 = mmToDots(el.left + el.width, dpi);
  const y1 = mmToDots(el.top + el.height, dpi);
  return x0 <= slack && y0 <= slack && x1 >= bitmapWidthDots - slack && y1 >= bitmapHeightDots - slack;
}

/** Inward frame from the border element's rectangle, clipped to the sent bitmap. */
export function drawPrintBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  scale = 1,
  opts?: DrawPrintBorderOpts,
): void {
  const s = Math.max(1, Math.round(scale));
  const bitmapW = opts?.bitmapWidthDots ?? 0;
  const bitmapH = opts?.bitmapHeightDots ?? 0;
  // Page-edge calibration is for the one frame around the whole sticker.
  // A border that only covers one cell keeps the rectangle stored on that cell.
  const baked =
    opts?.bakeFeed === true && bitmapW > 0 && bitmapH > 0 && borderCoversBitmap(el, dpi, bitmapW, bitmapH);
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (baked) {
    const outer = td404BorderOuterDots(bitmapW, bitmapH, dpi, td404BorderGapMm(el.edgeGapMm));
    x0 = outer.x0 * s;
    y0 = outer.y0 * s;
    x1 = outer.x1 * s;
    y1 = outer.y1 * s;
  } else {
    x0 = mmToDots(el.left, dpi) * s;
    y0 = Math.max(0, mmToDots(el.top, dpi) * s);
    x1 = mmToDots(el.left + el.width, dpi) * s;
    y1 = mmToDots(el.top + el.height, dpi) * s;
    if (opts?.bitmapWidthDots != null && opts.bitmapWidthDots > 0) {
      x1 = Math.min(x1, Math.round(opts.bitmapWidthDots) * s);
    }
    if (opts?.bitmapHeightDots != null && opts.bitmapHeightDots > 0) {
      y1 = Math.min(y1, Math.round(opts.bitmapHeightDots) * s);
    }
  }
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const style = resolveBorderStyle(el.borderStyle);
  const unit = baked
    ? { left: 0, right: 0, top: 0, bottom: 0 }
    : borderFrameInsetsForElement(el, dpi, opts?.extraBottomInsetMm ?? 0);
  const insets = {
    left: unit.left * s,
    right: unit.right * s,
    top: unit.top * s,
    bottom: unit.bottom * s,
  };
  drawInwardFrameInBox(
    target,
    w,
    h,
    dpi,
    el.lineWidth,
    style,
    x0,
    y0,
    insets,
    borderShapeForMedia(opts?.mediaShape),
    s,
  );
}

export type EdgeBorderPage = { widthDots: number; heightDots: number };

/**
 * JOSH only. Box (printer dots, already shifted) for a border drawn after the page
 * shift. A side that sits at the default 2 mm inset is placed so the stroke CENTER is
 * `centerGapMm` from the die-cut edge. Any other side keeps the
 * element's own rectangle, so moved or resized borders match the canvas.
 */
export function joshEdgeBorderBox(
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  page: EdgeBorderPage,
  shift: { x: number; y: number },
  centerGapMm: number,
): { x0: number; y0: number; w: number; h: number } {
  const ins = borderFrameInsetsForElement(el, dpi);
  let x0 = mmToDots(el.left, dpi) + ins.left;
  let y0 = Math.max(0, mmToDots(el.top, dpi)) + ins.top;
  let x1 = mmToDots(el.left + el.width, dpi) - ins.right;
  let y1 = mmToDots(el.top + el.height, dpi) - ins.bottom;
  const stroke = borderStrokeDots(
    el.lineWidth,
    dpi,
    borderStrokeFallbackMm(resolveBorderStyle(el.borderStyle)),
  );
  const grow = Math.floor(stroke / 2);
  const def = borderInsetDots(dpi);
  const target = Math.max(0, mmToDots(centerGapMm, dpi)) - grow;
  const near = (d: number) => Math.abs(d - def) <= 1;
  if (near(x0)) x0 = target;
  if (near(y0)) y0 = target;
  if (near(page.widthDots - x1)) x1 = page.widthDots - target;
  if (near(page.heightDots - y1)) y1 = page.heightDots - target;
  return {
    x0: x0 + shift.x,
    y0: y0 + shift.y,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0),
  };
}

/** Draw a border into an already-shifted page. Stroke is inward from the box. */
export function drawJoshEdgeBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  page: EdgeBorderPage,
  shift: { x: number; y: number },
  centerGapMm: number,
): void {
  const box = joshEdgeBorderBox(el, dpi, page, shift, centerGapMm);
  drawInwardFrameInBox(
    target,
    box.w,
    box.h,
    dpi,
    el.lineWidth,
    resolveBorderStyle(el.borderStyle),
    box.x0,
    box.y0,
    { left: 0, right: 0, top: 0, bottom: 0 },
    'rect',
    1,
  );
}

/**
 * TD-404 only. Border drawn after the page shift, so the content offset never moves it.
 * The outer edge comes from td404BorderOuterDots: centred on the die-cut centre, label
 * size minus 2 x the gap. Then the border's own shift. Stroke is inward from that box.
 */
export function drawTd404EdgeBorder(
  target: FrameFillTarget,
  el: Extract<LabelElement, { type: 'border' }>,
  dpi: number,
  label: EdgeBorderPage,
  shift: { x: number; y: number },
): void {
  // A 2-up cell border only frames its own half, so it keeps its rectangle. Snapping it to the
  // page edge would merge both cells into one frame.
  if (!borderCoversBitmap(el, dpi, label.widthDots, label.heightDots)) {
    const ins = borderFrameInsetsForElement(el, dpi);
    const x0 = mmToDots(el.left, dpi) + ins.left;
    const y0 = Math.max(0, mmToDots(el.top, dpi)) + ins.top;
    const x1 = mmToDots(el.left + el.width, dpi) - ins.right;
    const y1 = mmToDots(el.top + el.height, dpi) - ins.bottom;
    drawInwardFrameInBox(
      target,
      Math.max(1, x1 - x0),
      Math.max(1, y1 - y0),
      dpi,
      el.lineWidth,
      resolveBorderStyle(el.borderStyle),
      x0 + shift.x,
      y0 + shift.y,
      { left: 0, right: 0, top: 0, bottom: 0 },
      'rect',
      1,
    );
    return;
  }
  const outer = td404BorderOuterDots(label.widthDots, label.heightDots, dpi, td404BorderGapMm(el.edgeGapMm));
  drawInwardFrameInBox(
    target,
    Math.max(1, outer.x1 - outer.x0),
    Math.max(1, outer.y1 - outer.y0),
    dpi,
    el.lineWidth,
    resolveBorderStyle(el.borderStyle),
    outer.x0 + shift.x,
    outer.y0 + shift.y,
    { left: 0, right: 0, top: 0, bottom: 0 },
    'rect',
    1,
  );
}
