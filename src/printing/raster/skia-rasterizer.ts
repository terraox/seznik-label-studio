import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  type AutoWrapping,
} from '@/components/editor/types';
import { barcodeModulesForMode } from '@/lib/barcode-code128';
import { encodeDataMatrix } from '@/lib/barcode/datamatrix';
import { encodePdf417 } from '@/lib/barcode/pdf417';
import {
  snap1DBarcodeModules,
  snap2DMatrixToHardwareDots,
  type HardwareDpi,
} from '@/lib/barcode/barcode-snapping';
import {
  createLabelDocument,
  elementSizeMm,
  ptToMm,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import { joshBorderGapMm } from '@/lib/printer/josh-print';
import { dotsPerMm, mmToDots, rectMmToDots, td404BorderGapMm, td404BorderOuterDots } from '@/lib/printer/print-spec';
import { sortLayers } from '@/lib/template-schema';
import { printGridKnockoutsMm, printGridRectsDots, printGridSpacingMm } from '@/lib/print-grid';
import { PRINT_RULER_LINE_MM, drawPrintRuler, printRulerEnabled } from '@/lib/print-ruler';
import { parseSvgDrawOps, parseSvgViewBox, type ClipartDrawOp, type SvgViewBox } from '@/lib/clipart/parse-svg';
import { clampStrokeScale } from '@/lib/clipart/stroke-scale';
import { clipartSvgSource } from '@/lib/clipart/types';
import { needsComplexTextShaping, resolvePrintFontFamily } from '@/lib/fonts/text-font-family';
import {
  textHorizontalPaddingMm,
  textLineBoxHeightMm,
  textVerticalPaddingMm,
} from '@/lib/text-metrics';
import { visibleWrappedLines } from '@/lib/visible-text-layout';
import { formatBarcodeHri } from '@/lib/barcode/hri';
import { stretchThenRoundBars } from './barcode-stretch';
import { whitenOutsideUpsTiles } from './bitmap';
import type { LabelOrientation } from '@/lib/label-document';
import { rotateGray } from '@/lib/printer/escpos';
import { packGrayToMono1bpp } from './bit-packer';
import { borderStrokeMmOf, drawJoshEdgeBorder, drawPrintBorder, drawTd404EdgeBorder } from './print-border';
import { borderShapeForMedia } from './border-shapes';
import { applyInkDarkness, rectsToPx, scanCodeRectsMm } from './ink-darkness';
import { usesModedPrint } from './image-element-settings';
import { readyImageTile } from './image-tiles';
import { drawQrMeet } from './qr-meet';
import {
  makeOffscreenSurface,
  resetTextDrawLog,
  type RasterSurface,
  type RasterSurfaceBackend,
} from './skia-surface';

export type RasterizeOptions = {
  threshold?: number;
  /** Photographic content only. Fixture path leaves this false. */
  dither?: boolean;
  /** Reuse a previous result buffer (Task 4.6). Must match packed page size. */
  target?: RasterBitmap;
  /** Pin backend for profiling. Default: Skia when MakeOffscreen works. */
  backend?: RasterSurfaceBackend;
  /** Ground-truth only. Default 1. Packs/draws at N× then caller downscales. */
  dotScale?: number;
  /** TD-404 production print. Place the border and cancel the −1 mm feed on other layers. */
  bakeTd404Feed?: boolean;
  /**
   * User H/V offset in printer dots, applied to the finished page so every layer
   * (border included) moves by the same amount. Ink pushed past an edge is cropped.
   */
  shiftDots?: { x: number; y: number };
  /**
   * TD-404 production. Rotate the finished label by this many degrees clockwise in dots
   * (exact quarter turns, no resampling), so rotated jobs go out as the same mono bitmap
   * as unrotated ones. `shiftDots` then moves the label in its own frame (before the turn);
   * `paperShiftDots` and the border layer work in the paper frame (after it). Needs
   * `edgeBorders`. 90/270 swap the page: the bitmap is `heightMm` wide and `widthMm` tall.
   */
  rotationDeg?: LabelOrientation;
  /** With `rotationDeg`: printer registration shift in the rotated paper frame. */
  paperShiftDots?: { x: number; y: number };
  /**
   * Byte-align the page width. `floor` (default, TD-404) drops a partial last byte.
   * `ceil` (JOSH) keeps those dots and pads white on the right.
   */
  pageWidthPack?: 'floor' | 'ceil';
  /**
   * JOSH. Unrotated rectangular borders are drawn after the page shift into
   * `padRightDots` of extra white page on the right, so the stroke is never on the
   * last bitmap column. Every other layer is cropped exactly as without this option.
   */
  edgeBorders?: { padRightDots: number; centerGapMm: number; shiftDots?: { x: number; y: number } };
  /**
   * Manual darkness minus the bridge default (TD-404: -10..+5). 0 or absent leaves the
   * bitmap untouched. Barcodes and QR codes are excluded.
   */
  darknessSteps?: number;
}

export type RasterBitmap = {
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  mono1bppBuffer: Uint8Array;
};

const UNSUPPORTED: ReadonlySet<LabelElement['type']> = new Set([
  'table',
  'time',
  'arctext',
  'degrees',
  'signature',
]);

/** SVG stickers draw natively; tiled stickers and imported bitmaps still need the capture path. */
function vectorClipart(el: LabelElement): { ops: ClipartDrawOp[]; viewBox: SvgViewBox } | null {
  if (el.type !== 'clipart' || el.tile) return null;
  // Lazy: the clipart library pulls in app stores that host-side raster tests don't need.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getClipartById } = require('@/constants/clipart-library') as typeof import('@/constants/clipart-library');
  const svg = clipartSvgSource(getClipartById(el.clipartId));
  if (!svg) return null;
  const ops = parseSvgDrawOps(svg);
  return ops.length > 0 ? { ops, viewBox: parseSvgViewBox(svg) } : null;
}

/**
 * A clipart id this app does not have (a label from a newer app, or deleted own clipart) prints as
 * nothing. It must neither crash the job nor force the whole label off the fast path.
 */
function isUnknownClipart(el: LabelElement): boolean {
  if (el.type !== 'clipart') return false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getClipartById } = require('@/constants/clipart-library') as typeof import('@/constants/clipart-library');
  return getClipartById(el.clipartId) === undefined;
}

function isUnsupportedPrintType(el: LabelElement): boolean {
  if (el.type === 'clipart') return vectorClipart(el) == null && !isUnknownClipart(el);
  // A moded image whose dots were prepared (prepareImageTiles) is drawn here; every other image
  // still needs the capture path, exactly as before.
  if (el.type === 'image') return !(usesModedPrint(el) && readyImageTile(el) !== null);
  return UNSUPPORTED.has(el.type);
}

function collectUnsupportedHeadlessElements(doc: LabelDocument): { types: Set<string>; ids: string[] } {
  const types = new Set<string>();
  const ids: string[] = [];
  for (const el of doc.elements) {
    if (!isUnsupportedPrintType(el)) continue;
    types.add(el.type);
    ids.push(`${el.type}:${el.id}`);
  }
  return { types, ids };
}

/** True when every layer can be drawn by the headless Skia/dot raster (no ViewShot needed). */
export function canHeadlessRasterPrint(doc: LabelDocument): boolean {
  if (doc.referenceImage?.needPrinting === true) return false;
  return collectUnsupportedHeadlessElements(doc).types.size === 0;
}

/**
 * Headless TD-404 must abort if the document contains any Stage A-unsupported
 * type — including needPrinting=false. Skipping those and drawing the rest
 * would send a partial label.
 */
export function assertHeadlessRasterDocument(doc: LabelDocument): void {
  const { types, ids } = collectUnsupportedHeadlessElements(doc);
  if (types.size === 0) return;
  throw new Error(
    `Unsupported print element type: ${[...types].join(', ')} (${ids.join(', ')}). Headless TD-404 print aborted; no bytes were sent.`,
  );
}

export function packedPageDots(
  widthMm: number,
  heightMm: number,
  dpi: number,
  pack: 'floor' | 'ceil' = 'floor',
): {
  sizeDotsW: number;
  sizeDotsH: number;
  packedW: number;
  packedH: number;
} {
  const dpm = dotsPerMm(dpi);
  const sizeDotsW = Math.max(1, Math.round(widthMm * dpm));
  const sizeDotsH = Math.max(1, Math.round(heightMm * dpm));
  const bytes = pack === 'ceil' ? Math.ceil(sizeDotsW / 8) : Math.floor(sizeDotsW / 8);
  const packedW = Math.max(8, bytes * 8);
  return { sizeDotsW, sizeDotsH, packedW, packedH: sizeDotsH };
}

export function wrapPrintText(element: {
  text: string;
  fontSize: number;
  width: number;
  autoWrapping?: AutoWrapping;
  charSpacing?: number;
  bold?: boolean;
  verticalDisplay?: boolean;
}): string[] {
  return visibleWrappedLines({
    text: element.text,
    fontSize: element.fontSize,
    widthMm: element.width,
    autoWrapping: element.autoWrapping ?? 'Word',
    charSpacing: element.charSpacing ?? 0,
    bold: element.bold ?? false,
    verticalDisplay: element.verticalDisplay ?? false,
  });
}

export type RasterizeTiming = {
  allocMs: number;
  encodeMs: number;
  drawMs: number;
  readbackMs: number;
  packMs: number;
  rasterizeMs: number;
  bitpackMs: number;
  backend: RasterSurfaceBackend;
  result: RasterBitmap;
  gray: Uint8Array;
};

let encodeAccumMs = 0;
let activeDotScale = 1;
let activeBakeFeed = false;
let activeEdgeBorders = false;

/** Circle and ellipse cells keep that outline after a multi-up sheet is flattened. */
function printOutlineShape(doc: LabelDocument): string | undefined {
  return doc.upsTile?.shape ?? doc.mediaShape;
}

/**
 * Borders drawn in the post-shift pass: visible and unrotated. JOSH only does this for a
 * rectangular die-cut. TD-404 does it for round die-cuts too: otherwise a circle border is drawn
 * with the content and moves with the element shift, so its gaps to the die-cut come out unequal.
 */
function isEdgeBorder(el: LabelElement, doc: LabelDocument): el is Extract<LabelElement, { type: 'border' }> {
  return (
    el.type === 'border' &&
    el.needPrinting !== false &&
    el.visible !== false &&
    (el.rotation ?? 0) % 360 === 0 &&
    (activeBakeFeed || borderShapeForMedia(printOutlineShape(doc)) === 'rect')
  );
}

function whitenColumns(gray: Uint8Array, width: number, height: number, fromCol: number): void {
  if (fromCol >= width) return;
  for (let y = 0; y < height; y++) gray.fill(255, y * width + Math.max(0, fromCol), (y + 1) * width);
}

function dots(mm: number, dpi: number): number {
  return mmToDots(mm, dpi) * activeDotScale;
}

function dpmScaled(dpi: number): number {
  return dotsPerMm(dpi) * activeDotScale;
}

function timedEncode<T>(fn: () => T): T {
  const t = performance.now();
  const value = fn();
  encodeAccumMs += performance.now() - t;
  return value;
}

type DotBox = { x0: number; y0: number; w: number; h: number };

/** Same rectangle LabelPreview uses when printDpi is set. */
function placementBox(el: LabelElement, dpi: number): DotBox {
  const size = elementSizeMm(el);
  const rect = rectMmToDots(el.left, el.top, size.width, size.height, dpi);
  const s = activeDotScale;
  return {
    x0: rect.x0 * s,
    y0: rect.y0 * s,
    w: Math.max(1, rect.widthDots * s),
    h: Math.max(1, rect.heightDots * s),
  };
}

function drawDocumentToSurface(
  doc: LabelDocument,
  dpi: number,
  surface: RasterSurface,
  bitmapWidthDots: number,
  bitmapHeightDots: number,
): void {
  const dpm = dpmScaled(dpi);
  const gridSpacing = printGridSpacingMm(doc);
  if (gridSpacing != null) {
    const s = activeDotScale;
    const knockouts = printGridKnockoutsMm(doc);
    for (const r of printGridRectsDots(doc.widthMm, doc.heightMm, gridSpacing, dpi, knockouts, {
      width: bitmapWidthDots,
      height: bitmapHeightDots,
    })) {
      surface.fillRect(r.left * s, r.top * s, r.width * s, r.height * s, 0);
    }
  }
  if (printRulerEnabled(doc) && !(activeEdgeBorders && !activeBakeFeed)) {
    const s = activeDotScale;
    drawPrintRuler(surface, doc.widthMm, doc.heightMm, dpi, s);
  }
  for (const el of sortLayers(doc.elements)) {
    if (el.needPrinting === false || el.visible === false) continue;
    if (activeEdgeBorders && isEdgeBorder(el, doc)) continue;
    if (UNSUPPORTED.has(el.type)) {
      throw new Error(`Unsupported print element type: ${el.type}`);
    }
    const box = placementBox(el, dpi);
    if (el.type === 'image') {
      const tile = activeDotScale === 1 && usesModedPrint(el) ? readyImageTile(el, dpi) : null;
      if (!tile) {
        throw new Error('Unsupported print element type: image (decode not wired in Stage A host path)');
      }
      surface.blitGray(
        box.x0 + Math.round((box.w - tile.width) / 2),
        box.y0 + Math.round((box.h - tile.height) / 2),
        tile.width,
        tile.height,
        tile.gray,
        tile.mask,
      );
      continue;
    }
    const draw = () => {
      switch (el.type) {
        case 'text':
          drawText(surface, el, dpi, dpm, box);
          break;
        case 'barcode':
          drawBarcode(surface, el, dpi, dpm, box);
          break;
        case 'qrcode':
          drawQr(surface, el, dpi, box);
          break;
        case 'border':
          drawPrintBorder(surface, el, dpi, activeDotScale, {
            bitmapWidthDots,
            bitmapHeightDots,
            bakeFeed: activeBakeFeed,
            mediaShape: printOutlineShape(doc),
          });
          break;
        case 'line':
          drawLine(surface, el, dpm, box);
          break;
        case 'shape':
          drawShape(surface, el, dpm, box);
          break;
        case 'clipart': {
          const art = vectorClipart(el);
          if (!art && isUnknownClipart(el)) break; // unknown art: draw nothing, print the rest
          if (!art || !surface.drawVectorGlyph) {
            throw new Error(`Unsupported print element type: clipart (${el.id})`);
          }
          // Same placement as the canvas: a square of min(w, h), centred in the box.
          const side = Math.min(box.w, box.h);
          const thickness = clampStrokeScale(el.strokeScale);
          const scaled = thickness === 1 ? art.ops : art.ops.map((op) => ({ ...op, sw: op.sw * thickness }));
          const gx = box.x0 + (box.w - side) / 2;
          const gy = box.y0 + (box.h - side) / 2;
          if (el.clipartId.startsWith('le-') && surface.drawLineEmojiGlyph) {
            surface.drawLineEmojiGlyph(scaled, gx, gy, side, 0);
          } else {
            surface.drawVectorGlyph(scaled, gx, gy, side, 0, art.viewBox);
          }
          break;
        }
        default:
          throw new Error(`Unsupported print element type: ${(el as LabelElement).type}`);
      }
    };
    const rotation = el.rotation ?? 0;
    if (rotation % 360 !== 0) {
      // Line-art emoji rotates around the box corner on the canvas (the live
      // content transform origin). Every other element stays on the box center.
      const lineEmoji = el.type === 'clipart' && el.clipartId.startsWith('le-');
      const px = lineEmoji ? box.x0 : box.x0 + box.w / 2;
      const py = lineEmoji ? box.y0 : box.y0 + box.h / 2;
      surface.withRotation(px, py, rotation, draw);
    } else {
      draw();
    }
  }
}

export function rasterizeDocumentToBitmap(
  doc: LabelDocument,
  dpi: number,
  options: RasterizeOptions = {},
): RasterBitmap {
  return rasterizeDocumentToBitmapTimed(doc, dpi, options).result;
}

/** Task 4.4 — split rasterize vs bit-pack timing on device. */
export function rasterizeDocumentToBitmapTimed(
  doc: LabelDocument,
  dpi: number,
  options: RasterizeOptions = {},
): RasterizeTiming {
  const rotationDeg: LabelOrientation =
    options.rotationDeg != null && options.edgeBorders != null && (options.dotScale ?? 1) === 1
      ? options.rotationDeg
      : 0;
  // A rotated label is drawn on its own full-width page (no byte crop) and cropped after the turn.
  const page = packedPageDots(
    doc.widthMm,
    doc.heightMm,
    dpi,
    rotationDeg !== 0 ? 'ceil' : (options.pageWidthPack ?? 'floor'),
  );
  const { packedW, packedH } = page;
  const threshold = options.threshold ?? 160;
  activeDotScale = Math.max(1, Math.round(options.dotScale ?? 1));
  activeBakeFeed = options.bakeTd404Feed === true;
  const padRight = Math.max(0, Math.round(options.edgeBorders?.padRightDots ?? 0));
  activeEdgeBorders = options.edgeBorders != null && activeDotScale === 1;
  const borderGapMm = options.edgeBorders?.centerGapMm ?? 2;
  const outW = activeEdgeBorders && padRight > 0 ? Math.max(8, Math.ceil((page.sizeDotsW + padRight) / 8) * 8) : packedW;
  resetTextDrawLog();
  const surfW = outW * activeDotScale;
  const surfH = packedH * activeDotScale;

  encodeAccumMs = 0;
  const tAlloc0 = performance.now();
  const surface = makeOffscreenSurface(surfW, surfH, options.backend);
  const allocMs = performance.now() - tAlloc0;

  const tDraw0 = performance.now();
  drawDocumentToSurface(doc, dpi, surface, packedW, packedH);
  const drawWallMs = performance.now() - tDraw0;
  const encodeMs = encodeAccumMs;
  const drawMs = Math.max(0, drawWallMs - encodeMs);

  const tRead0 = performance.now();
  const steps = Math.round(options.darknessSteps ?? 0);
  const drawn = surface.readGray();
  // Layers keep the exact page they always had: nothing past the old packed width.
  if (activeEdgeBorders) whitenColumns(drawn, surfW, surfH, packedW);
  let gray = shiftGray(
    steps === 0
      ? drawn
      : applyInkDarkness(
          drawn,
          surfW,
          surfH,
          threshold,
          steps,
          rectsToPx(scanCodeRectsMm(doc), dpmScaled(dpi), activeDotScale),
        ),
    surfW,
    surfH,
    Math.round(options.shiftDots?.x ?? 0) * activeDotScale,
    Math.round(options.shiftDots?.y ?? 0) * activeDotScale,
  );
  const tile = doc.upsTile;
  if (tile && (tile.shape === 'circle' || tile.shape === 'ellipse')) {
    const scale = activeDotScale;
    whitenOutsideUpsTiles(gray, surfW, surfH, {
      shape: tile.shape,
      columns: tile.columns,
      originX: mmToDots(tile.originXMm, dpi) * scale,
      originY: mmToDots(tile.originYMm, dpi) * scale,
      cellWidth: mmToDots(tile.cellWidthMm, dpi) * scale,
      cellHeight: mmToDots(tile.cellHeightMm, dpi) * scale,
      pitch: mmToDots(tile.cellWidthMm + tile.gapMm, dpi) * scale,
    });
  }
  let outWidth = surfW;
  let outHeight = surfH;
  if (activeEdgeBorders && rotationDeg !== 0) {
    const turned = turnLabelToPaper(
      gray,
      surfW,
      page,
      rotationDeg,
      doc,
      dpi,
      options.paperShiftDots,
      options.pageWidthPack ?? 'floor',
    );
    gray = turned.gray;
    outWidth = turned.width;
    outHeight = turned.height;
    gray = mergeEdgeBorders(
      gray,
      turned.paperDoc,
      dpi,
      outWidth,
      outHeight,
      {
        x: Math.round(options.edgeBorders?.shiftDots?.x ?? 0),
        y: Math.round(options.edgeBorders?.shiftDots?.y ?? 0),
      },
      threshold,
      steps,
      borderGapMm,
    );
  } else if (activeEdgeBorders) {
    // Same crop the native side applied before (sizeDotsW), then the border layer.
    whitenColumns(gray, surfW, surfH, page.sizeDotsW);
    gray = mergeEdgeBorders(
      gray,
      doc,
      dpi,
      surfW,
      surfH,
      // Borders use their own shift when given; otherwise the page shift.
      // TD-404 never falls back to the page shift: its border is independent of it.
      {
        x: Math.round(options.edgeBorders?.shiftDots?.x ?? (activeBakeFeed ? 0 : options.shiftDots?.x ?? 0)),
        y: Math.round(options.edgeBorders?.shiftDots?.y ?? (activeBakeFeed ? 0 : options.shiftDots?.y ?? 0)),
      },
      threshold,
      steps,
      borderGapMm,
    );
  }
  const readbackMs = performance.now() - tRead0;

  const tPack0 = performance.now();
  const packed = packGrayToMono1bpp(
    gray,
    outWidth,
    outHeight,
    threshold,
    options.target?.mono1bppBuffer,
  );
  const packMs = performance.now() - tPack0;

  const result: RasterBitmap = options.target
    ? (() => {
        options.target!.widthDots = outWidth;
        options.target!.heightDots = outHeight;
        options.target!.bytesPerRow = packed.bytesPerRow;
        options.target!.mono1bppBuffer = packed.mono1bppBuffer;
        return options.target!;
      })()
    : {
        widthDots: outWidth,
        heightDots: rotationDeg !== 0 ? outHeight : packedH * activeDotScale,
        bytesPerRow: packed.bytesPerRow,
        mono1bppBuffer: packed.mono1bppBuffer,
      };

  return {
    allocMs,
    encodeMs,
    drawMs,
    readbackMs,
    packMs,
    rasterizeMs: allocMs + encodeMs + drawMs + readbackMs,
    bitpackMs: packMs,
    backend: surface.backend,
    result,
    gray,
  };
}

/**
 * Rotated TD-404 job. `gray` is the finished label page (label frame, user shift applied,
 * `surfW` wide). Crop it to the label, turn it, fit the result to the paper's byte-packed
 * width, then apply the printer registration shift in the paper frame.
 */
function turnLabelToPaper(
  gray: Uint8Array,
  surfW: number,
  page: { sizeDotsW: number; sizeDotsH: number },
  rotationDeg: LabelOrientation,
  doc: LabelDocument,
  dpi: number,
  paperShiftDots?: { x: number; y: number },
  paperPack: 'floor' | 'ceil' = 'floor',
): { gray: Uint8Array; width: number; height: number; paperDoc: LabelDocument } {
  const labelW = page.sizeDotsW;
  const labelH = page.sizeDotsH;
  const cropped = new Uint8Array(labelW * labelH);
  for (let y = 0; y < labelH; y++) {
    cropped.set(gray.subarray(y * surfW, y * surfW + labelW), y * labelW);
  }
  const turned = rotateGray({ width: labelW, height: labelH, gray: cropped }, rotationDeg);
  const quarter = rotationDeg === 90 || rotationDeg === 270;
  // Borders are drawn on the paper page, so their boxes turn with it (a full-bleed border stays
  // full-bleed; a 2-up cell border keeps framing the same half).
  const turnBox = (el: Extract<LabelElement, { type: 'border' }>) => {
    const { left: l, top: t, width: w, height: h } = el;
    const W = doc.widthMm;
    const H = doc.heightMm;
    if (rotationDeg === 90) return { ...el, left: H - t - h, top: l, width: h, height: w };
    if (rotationDeg === 270) return { ...el, left: t, top: W - l - w, width: h, height: w };
    return { ...el, left: W - l - w, top: H - t - h };
  };
  const paperDoc = {
    ...doc,
    widthMm: quarter ? doc.heightMm : doc.widthMm,
    heightMm: quarter ? doc.widthMm : doc.heightMm,
    elements: doc.elements.map((el) => (el.type === 'border' ? turnBox(el) : el)),
  };
  const paper = packedPageDots(paperDoc.widthMm, paperDoc.heightMm, dpi, paperPack);
  const width = paper.packedW;
  const height = turned.height;
  const fitted = new Uint8Array(width * height);
  fitted.fill(255);
  const copyW = Math.min(width, turned.width);
  for (let y = 0; y < height; y++) {
    fitted.set(turned.gray.subarray(y * turned.width, y * turned.width + copyW), y * width);
  }
  return {
    gray: shiftGray(fitted, width, height, Math.round(paperShiftDots?.x ?? 0), Math.round(paperShiftDots?.y ?? 0)),
    width,
    height,
    paperDoc,
  };
}

/** Draw deferred borders onto a white layer (page-shifted coordinates) and darken-merge it into gray. */
function mergeEdgeBorders(
  gray: Uint8Array,
  doc: LabelDocument,
  dpi: number,
  width: number,
  height: number,
  shift: { x: number; y: number },
  threshold: number,
  steps: number,
  centerGapMm: number,
): Uint8Array {
  const borders = doc.elements.filter((el) => isEdgeBorder(el, doc));
  const ruler = printRulerEnabled(doc) && !activeBakeFeed;
  if (borders.length === 0 && !ruler) return gray;
  let layer: Uint8Array = new Uint8Array(width * height);
  layer.fill(255);
  const fillRect = (x: number, y: number, w: number, h: number, value: number) => {
    const xa = Math.max(0, Math.round(x));
    const ya = Math.max(0, Math.round(y));
    const xb = Math.min(width, Math.round(x + w));
    const yb = Math.min(height, Math.round(y + h));
    for (let yy = ya; yy < yb; yy++) layer.fill(value, yy * width + xa, yy * width + xb);
  };
  const pageDots = { widthDots: mmToDots(doc.widthMm, dpi), heightDots: mmToDots(doc.heightMm, dpi) };
  if (ruler) {
    // Same calibrated layer and gap as the border, so the scale sits where a border does.
    const gap = Math.max(0, centerGapMm - PRINT_RULER_LINE_MM / 2);
    const inner = {
      w: Math.max(1, doc.widthMm - 2 * gap),
      h: Math.max(1, doc.heightMm - 2 * gap),
    };
    drawPrintRuler({ fillRect }, inner.w, inner.h, dpi, 1, {
      x: mmToDots(gap, dpi) + shift.x,
      y: mmToDots(gap, dpi) + shift.y,
    });
  }
  for (const el of sortLayers(doc.elements)) {
    if (activeBakeFeed && isEdgeBorder(el, doc)) {
      drawTd404EdgeBorder({ fillRect }, el, dpi, pageDots, shift, borderShapeForMedia(printOutlineShape(doc)));
      const o = td404BorderOuterDots(pageDots.widthDots, pageDots.heightDots, dpi, td404BorderGapMm(el.edgeGapMm), borderStrokeMmOf(el));
      console.info(
        `[TD404-BORDER] layer x ${o.x0}-${o.x1} y ${o.y0}-${o.y1} dots of ${pageDots.widthDots}x${pageDots.heightDots} | shift ${shift.x},${shift.y}`,
      );
    } else if (isEdgeBorder(el, doc)) {
      drawJoshEdgeBorder({ fillRect }, el, dpi, pageDots, shift, el.edgeGapMm != null ? joshBorderGapMm(el.edgeGapMm) : centerGapMm);
    }
  }
  if (steps !== 0) layer = applyInkDarkness(layer, width, height, threshold, steps, []);
  const out = new Uint8Array(gray);
  for (let i = 0; i < out.length; i++) if (layer[i] < out[i]) out[i] = layer[i];
  return out;
}

/** Move the whole page by (dx, dy) dots. Uncovered area is white. */
export function shiftGray(gray: Uint8Array, width: number, height: number, dx: number, dy: number): Uint8Array {
  if (dx === 0 && dy === 0) return gray;
  const out = new Uint8Array(width * height);
  out.fill(255);
  const x0 = Math.max(0, dx);
  const x1 = Math.min(width, width + dx);
  if (x1 <= x0) return out;
  for (let y = 0; y < height; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= height) continue;
    out.set(gray.subarray(sy * width + x0 - dx, sy * width + x1 - dx), y * width + x0);
  }
  return out;
}

function inkValue(antiColor?: boolean): number {
  return antiColor ? 255 : 0;
}

function drawText(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'text' }>,
  _dpi: number,
  dpm: number,
  box: DotBox,
): void {
  const { x0, y0, w: boxW, h: boxH } = box;
  if (el.antiColor) {
    surface.fillRect(x0, y0, boxW, boxH, 0);
  }
  const raw =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.text;
  const family = resolvePrintFontFamily(raw, el.fontFamily);
  const lines = visibleWrappedLines({
    text: raw,
    fontSize: el.fontSize,
    widthMm: el.width,
    autoWrapping: el.autoWrapping,
    lineSpacing: el.lineSpacing,
    charSpacing: el.charSpacing,
    bold: el.bold,
    verticalDisplay: el.verticalDisplay,
    fontFamily: family ?? el.fontFamily,
  });
  const padX = Math.round(textHorizontalPaddingMm(el.fontSize) * dpm);
  const padY = Math.round(textVerticalPaddingMm(el.fontSize) * dpm);
  const em = Math.max(1, Math.round(ptToMm(el.fontSize) * dpm));
  const lineH = Math.max(
    em,
    Math.round(textLineBoxHeightMm(el.fontSize, el.lineSpacing, family ?? el.fontFamily, raw) * dpm),
  );
  const ink = inkValue(el.antiColor);
  const letterSpacingDots = (el.charSpacing ?? 0) * dpm;
  const contentW = Math.max(1, boxW - padX * 2);
  // Same line box as the editor: the em sits in the middle of the line, so the
  // gap between lines matches the preview instead of stacking on the baseline.
  let ty = y0 + padY;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const emTop = ty + Math.max(0, Math.floor((lineH - em) / 2));
    if (line.length > 0) {
      const textStyle = {
        fontSizeDots: em,
        bold: el.bold,
        italic: el.italic,
        underline: el.underline,
        strikethrough: el.strikethrough,
        family: resolvePrintFontFamily(line, el.fontFamily),
        ink,
        letterSpacingDots,
      };
      const lineW = Math.round(surface.measureTextWidth(line, textStyle));
      const justify =
        (el.align === 'justify' || el.align === 'spacing') &&
        i < lines.length - 1 &&
        line.includes(' ') &&
        !needsComplexTextShaping(line);
      if (justify && lineW < contentW) {
        const words = line.split(' ');
        const extra = (contentW - lineW) / Math.max(1, words.length - 1);
        let cursor = x0 + padX;
        for (let w = 0; w < words.length; w++) {
          const word = words[w];
          if (word.length > 0) surface.drawTextLine(word, Math.round(cursor), emTop, textStyle);
          const wordW = word.length > 0 ? surface.measureTextWidth(word, textStyle) : 0;
          const spaceW = w < words.length - 1 ? surface.measureTextWidth(' ', textStyle) : 0;
          cursor += wordW + spaceW + (w < words.length - 1 ? extra : 0);
        }
      } else {
        let tx = x0 + padX;
        if (el.align === 'center') tx = x0 + padX + Math.floor((contentW - lineW) / 2);
        else if (el.align === 'right') tx = x0 + padX + Math.max(0, contentW - lineW);
        surface.drawTextLine(line, tx, emTop, textStyle);
      }
    }
    ty += lineH;
  }
}

function drawBarcode(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'barcode' }>,
  _dpi: number,
  dpm: number,
  box: DotBox,
): void {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || '0123456789';
  const rawModules = timedEncode(() => barcodeModulesForMode(el.encodeMode, content));
  if (!rawModules) throw new Error(`Invalid barcode content for mode ${el.encodeMode}`);
  // Same snap inputs as BarcodeContent (203 DPI, no quiet zone). Stretch fills the print box.
  const snapped = snap1DBarcodeModules(rawModules, el.width, 203, false);
  if (!snapped) throw new Error('Barcode snap failed');
  const { x0, y0, w: boxW, h: boxH } = box;
  const ink = inkValue(el.antiColor);
  if (el.antiColor) surface.fillRect(x0, y0, boxW, boxH, 0);
  const fontH = Math.max(8, Math.round(ptToMm(el.fontSize) * dpm));
  const showLabel = el.textFlag !== 'Hide';
  const labelH = showLabel ? Math.max(8, Math.round(fontH * 1.2)) : 0;
  const barsH = Math.max(2, boxH - labelH);
  const barsY = el.textFlag === 'Top' ? y0 + labelH : y0;
  const rounded = stretchThenRoundBars(snapped.bars, x0, boxW);
  for (const bar of rounded) {
    surface.fillRect(bar.x0, barsY, bar.width, barsH, ink);
  }
  if (showLabel) {
    const hri = formatBarcodeHri(el.encodeMode, content);
    const labelY = el.textFlag === 'Top' ? y0 : y0 + barsH;
    const textStyle = {
      fontSizeDots: fontH,
      bold: el.bold,
      italic: el.italic,
      underline: el.underline,
      strikethrough: el.strikethrough,
      family: resolvePrintFontFamily(hri, el.fontFamily),
      ink,
    };
    const lineW = Math.round(surface.measureTextWidth(hri, textStyle));
    let tx = x0;
    if (el.align === 'center') tx = x0 + Math.max(0, Math.floor((boxW - lineW) / 2));
    else if (el.align === 'right') tx = x0 + Math.max(0, boxW - lineW);
    const textY = labelY + Math.max(0, Math.floor((labelH - fontH) / 2));
    surface.drawTextLine(hri, tx, textY, textStyle);
  }
}

function drawQr(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'qrcode' }>,
  dpi: number,
  box: DotBox,
): void {
  const content =
    el.contentType === 'Data Source' && el.columnNameContent
      ? `{${el.columnNameContent}}`
      : el.content || 'https://seznik.in';
  const qz = Math.max(0, parseInt(String(el.zoneSize), 10) || 0);
  const ink = inkValue(el.antiColor);
  const { x0, y0, w: boxW, h: boxH } = box;
  if (el.antiColor) surface.fillRect(x0, y0, boxW, boxH, 0);

  if (el.encodeMode === 'QRCode' || !el.encodeMode) {
    timedEncode(() =>
      drawQrMeet(
        surface,
        content,
        (el.errorLevel as 'L' | 'M' | 'Q' | 'H') || 'M',
        qz,
        x0,
        y0,
        boxW,
        boxH,
        ink,
      ),
    );
    return;
  }

  if (el.encodeMode === 'DataMatrix') {
    const dm = timedEncode(() => encodeDataMatrix(content, el.width > el.height * 1.5));
    if (!dm) throw new Error('DataMatrix encode failed');
    const snap = snap2DMatrixToHardwareDots(
      dm.cols,
      dm.rows,
      el.width,
      el.height,
      dpi as HardwareDpi,
      Math.max(1, qz),
    );
    const ox = x0 + dots(snap.offsetXMm, dpi);
    const oy = y0 + dots(snap.offsetYMm, dpi);
    const qzDots = Math.max(1, qz) * snap.dotSize;
    for (let r = 0; r < dm.rows; r++) {
      for (let c = 0; c < dm.cols; c++) {
        if (dm.matrix[r][c]) {
          surface.fillRect(
            ox + qzDots + c * snap.dotSize,
            oy + qzDots + r * snap.dotSize,
            snap.dotSize,
            snap.dotSize,
            ink,
          );
        }
      }
    }
    return;
  }

  if (el.encodeMode === 'PDF417') {
    const pdf = timedEncode(() => encodePdf417(content, 2));
    if (!pdf) throw new Error('PDF417 encode failed');
    const snap = snap2DMatrixToHardwareDots(
      pdf.cols,
      pdf.rows,
      el.width,
      el.height,
      dpi as HardwareDpi,
      Math.max(2, qz),
    );
    const ox = x0 + dots(snap.offsetXMm, dpi);
    const oy = y0 + dots(snap.offsetYMm, dpi);
    const qzM = Math.max(2, qz);
    for (let r = 0; r < pdf.rows; r++) {
      for (let c = 0; c < pdf.cols; c++) {
        if (pdf.matrix[r][c]) {
          surface.fillRect(
            ox + (c + qzM) * snap.dotSize,
            oy + (r + qzM) * snap.dotSize,
            snap.dotSize,
            snap.dotSize,
            ink,
          );
        }
      }
    }
    return;
  }

  throw new Error(`Unsupported 2D encode mode: ${el.encodeMode}`);
}

function drawLine(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'line' }>,
  dpm: number,
  box: DotBox,
): void {
  const { x0, y0, w, h } = box;
  const vertical = h >= w * 2;
  const stroke = Math.max(1, Math.round((vertical ? el.width : el.height) * dpm));
  if (vertical) {
    surface.fillRect(x0 + Math.floor(w / 2) - Math.floor(stroke / 2), y0, stroke, h, 0);
  } else {
    surface.fillRect(x0, y0 + Math.floor(h / 2) - Math.floor(stroke / 2), w, stroke, 0);
  }
}

/** Print gray (0 ink .. 255 paper) for a shape's fill, matching what the editor paints. */
function shapeFillGray(el: Extract<LabelElement, { type: 'shape' }>): number {
  const hex = (el.fillColor ?? '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0; // no explicit colour: the editor fills with the ink colour
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function drawShape(
  surface: RasterSurface,
  el: Extract<LabelElement, { type: 'shape' }>,
  dpm: number,
  box: DotBox,
): void {
  const { x0, y0, w, h } = box;
  const stroke = Math.max(1, Math.round(el.lineWidth * dpm));
  const curved = el.figureShape === 'oval' || el.figureShape === 'circle' || el.figureShape === 'roundedRectangle';
  if (!curved) {
    if (el.fill) surface.fillRect(x0, y0, w, h, shapeFillGray(el));
    surface.strokeRect(x0, y0, w, h, stroke, 0);
    return;
  }
  let sx = x0;
  let sy = y0;
  let sw = w;
  let sh = h;
  let kind: 'roundRect' | 'ellipse' = 'ellipse';
  if (el.figureShape === 'circle') {
    // A circle is the largest square that fits, centred in the box, like the editor draws it.
    const side = Math.min(w, h);
    sx = x0 + (w - side) / 2;
    sy = y0 + (h - side) / 2;
    sw = side;
    sh = side;
  } else if (el.figureShape === 'roundedRectangle') {
    kind = 'roundRect';
  }
  const radius = Math.max(0, el.roundRadius * dpm);
  if (el.fill) {
    surface.paintShape({ kind, x: sx, y: sy, w: sw, h: sh, radius, stroke: null }, shapeFillGray(el));
  }
  surface.paintShape({ kind, x: sx, y: sy, w: sw, h: sh, radius, stroke }, 0);
}

/** Frozen 50×30 mm fixture from PHASE_4_PLAN.md Part 1. */
export function createPhase4FrozenDocument(): LabelDocument {
  const text: LabelElement = {
    id: 'phase4-text',
    type: 'text',
    ...DEFAULT_ELEMENT_STATE,
    text: 'Phase 4 baseline label 50x30 text wrap check',
    left: 3,
    top: 3,
    width: 44,
    height: 8,
    align: 'left',
    autoWrapping: 'Word',
    fontFamily: 'Default',
    needPrinting: true,
  };
  const barcode: LabelElement = {
    id: 'phase4-barcode',
    type: 'barcode',
    ...DEFAULT_BARCODE_STATE,
    content: 'BASELINE50X30',
    encodeMode: 'CODE-128',
    textFlag: 'Bottom',
    left: 3,
    top: 12,
    width: 28,
    height: 12,
    needPrinting: true,
  };
  const qr: LabelElement = {
    id: 'phase4-qr',
    type: 'qrcode',
    ...DEFAULT_QRCODE_STATE,
    content: 'https://sez.print/baseline',
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '1' as typeof DEFAULT_QRCODE_STATE.zoneSize,
    left: 34,
    top: 12,
    width: 13,
    height: 13,
    needPrinting: true,
  };
  const border: LabelElement = {
    id: 'phase4-border',
    type: 'border',
        borderStyle: 'solid-medium',
    lineWidth: 0.35,
    rotation: 0,
    left: 1,
    top: 1,
    width: 48,
    height: 28,
    lockMovement: true,
    needPrinting: true,
    drawingColorIndex: 1,
  };
  return createLabelDocument({
    name: 'Phase 4 frozen 50x30',
    widthMm: 50,
    heightMm: 30,
    paperType: 'Label',
    elements: [border, text, barcode, qr],
  });
}
