/**
 * Task 4.1 offscreen surface.
 *
 * Device: Skia.Surface.MakeOffscreen + canvas draw + readPixels.
 * Host/CI: software dot-buffer fallback when Skia is unavailable in Node.
 */

import { needsComplexTextShaping, textContainsEmoji } from '@/lib/fonts/text-font-family';
import { splitPrintTextSegments } from '@/lib/text/emoji-segments';
import { inkSquare } from '@/lib/clipart/ink-bounds';
import { clipartOpToSvgPath, separateSvgArcFlags, type ClipartDrawOp } from '@/lib/clipart/parse-svg';

import { fillEllipse, fillRect, makeDotSurface, strokeRect, type DotSurface } from './dot-surface';
import {
  drawEmojiSegmentAsImage,
  measureEmojiSegmentWidth,
  stampEmojiDots,
  type EmojiSkiaModule,
} from './skia-emoji-print';
import { drawShapedTextLine, measureShapedTextWidth } from './skia-shaped-text';

export type RasterSurfaceBackend = 'skia' | 'dot-buffer';

export type TextDrawRecord = {
  text: string;
  x: number;
  y: number;
  fontSizeDots: number;
  family?: string;
  bold?: boolean;
  italic?: boolean;
  backend: RasterSurfaceBackend;
};

let textDrawLog: TextDrawRecord[] = [];

export function resetTextDrawLog(): void {
  textDrawLog = [];
}

export function getTextDrawLog(): TextDrawRecord[] {
  return textDrawLog.slice();
}

export type TextDrawStyle = {
  fontSizeDots: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  family?: string;
  ink: number;
  /** Extra advance after each character, in dots. 0 leaves the face's natural spacing. */
  letterSpacingDots?: number;
};

export type RasterSurface = {
  backend: RasterSurfaceBackend;
  width: number;
  height: number;
  fillRect: (x: number, y: number, w: number, h: number, gray: number) => void;
  strokeRect: (x: number, y: number, w: number, h: number, stroke: number, gray: number) => void;
  fillEllipse: (cx: number, cy: number, rx: number, ry: number, gray: number) => void;
  drawTextLine: (text: string, x: number, y: number, style: TextDrawStyle) => void;
  measureTextWidth: (text: string, style: TextDrawStyle) => number;
  /** Clockwise about (cx, cy), matching a React Native view rotate. No-op at multiples of 360. */
  withRotation: (cx: number, cy: number, degrees: number, draw: () => void) => void;
  /**
   * Draws a 24x24-grid vector sticker into the square at (x, y) with side `size` dots.
   * Skia only; the dot-buffer host fallback has no path rasterizer.
   */
  drawVectorGlyph?: (ops: ClipartDrawOp[], x: number, y: number, size: number, gray: number) => void;
  /**
   * Line-art emoji only. Same square as the canvas SvgXml (viewBox 0 0 24 24,
   * round caps, viewport clip). Circles and ellipses are the SVG primitives,
   * not the arc-path stand-in.
   */
  drawLineEmojiGlyph?: (ops: ClipartDrawOp[], x: number, y: number, size: number, gray: number) => void;
  readGray: () => Uint8Array;
};

export type SkiaOffscreenProbe = {
  apiAvailable: boolean;
  create600x360: boolean;
  rasterizerBackend: RasterSurfaceBackend;
  error?: string;
};

const FIXTURE_W = 600;
const FIXTURE_H = 360;

type SkiaModule = {
  Skia: {
    Surface: { MakeOffscreen: (w: number, h: number) => SkiaSurface | null };
    Paint: () => SkiaPaint;
    Color: (c: string | number) => unknown;
    XYWHRect: (x: number, y: number, w: number, h: number) => unknown;
    Font: (typeface: unknown, size?: number) => SkiaFont;
    Path: { MakeFromSVGString: (svg: string) => unknown | null };
  };
  matchFont: (style: {
    fontFamily?: string;
    fontSize: number;
    fontWeight?: string;
    fontStyle?: string;
  }) => SkiaFont;
  PaintStyle: { Fill: number; Stroke: number };
  StrokeCap?: { Round: number };
  StrokeJoin?: { Round: number };
  ClipOp?: { Intersect: number };
  ColorType: { RGBA_8888: number };
  AlphaType: { Unpremul: number };
} & EmojiSkiaModule;

type SkiaSurface = {
  width: () => number;
  height: () => number;
  getCanvas: () => SkiaCanvas;
  flush: () => void;
  makeImageSnapshot: () => SkiaImage;
};

type SkiaCanvas = {
  clear: (color: unknown) => void;
  drawRect: (rect: unknown, paint: SkiaPaint) => void;
  drawOval: (rect: unknown, paint: SkiaPaint) => void;
  drawText: (text: string, x: number, y: number, paint: SkiaPaint, font: SkiaFont) => void;
  drawImage?: (image: unknown, x: number, y: number, paint?: SkiaPaint) => void;
  drawImageRect?: (
    image: unknown,
    src: unknown,
    dest: unknown,
    paint: SkiaPaint,
    fastSample?: boolean,
  ) => void;
  save?: () => void;
  skew?: (sx: number, sy: number) => void;
  restore?: () => void;
  translate?: (x: number, y: number) => void;
  rotate?: (degrees: number, px?: number, py?: number) => void;
  scale?: (sx: number, sy: number) => void;
  drawPath?: (path: unknown, paint: SkiaPaint) => void;
  drawCircle?: (cx: number, cy: number, radius: number, paint: SkiaPaint) => void;
  clipRect?: (rect: unknown, op: number, doAntiAlias: boolean) => void;
};

type SkiaPaint = {
  setColor: (color: unknown) => void;
  setStyle: (style: number) => void;
  setStrokeWidth: (width: number) => void;
  setAntiAlias: (aa: boolean) => void;
  setStrokeCap?: (cap: number) => void;
  setStrokeJoin?: (join: number) => void;
};

type SkiaFont = {
  measureText: (text: string) => { width: number };
};

type SkiaImage = {
  readPixels: (
    x?: number,
    y?: number,
    info?: { width: number; height: number; colorType: number; alphaType: number },
  ) => Uint8Array | Float32Array | null;
};

function loadSkiaModule(): SkiaModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@shopify/react-native-skia') as SkiaModule;
  } catch {
    return null;
  }
}

function grayToColor(skia: SkiaModule, gray: number): unknown {
  const v = gray < 0 ? 0 : gray > 255 ? 255 : gray | 0;
  const hex = v.toString(16).padStart(2, '0');
  return skia.Skia.Color(`#${hex}${hex}${hex}`);
}

function rgbaToGray(pixels: Uint8Array | Float32Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = (pixels[o] * 77 + pixels[o + 1] * 150 + pixels[o + 2] * 29) >> 8;
  }
  return gray;
}

type TextSegmentOps = {
  measureSegment: (text: string, style: TextDrawStyle) => number;
  drawSegment: (text: string, x: number, y: number, style: TextDrawStyle) => void;
  measureEmoji: (emoji: string, style: TextDrawStyle) => number;
  drawEmoji: (emoji: string, x: number, y: number, style: TextDrawStyle) => number;
};

function measureTextLineWidth(text: string, style: TextDrawStyle, ops: TextSegmentOps): number {
  if (!textContainsEmoji(text)) return ops.measureSegment(text, style);
  let width = 0;
  for (const segment of splitPrintTextSegments(text)) {
    if (segment.kind === 'text') width += ops.measureSegment(segment.value, style);
    else width += ops.measureEmoji(segment.value, style);
  }
  return width;
}

function drawTextLineMixed(
  text: string,
  x: number,
  y: number,
  style: TextDrawStyle,
  ops: TextSegmentOps,
): void {
  if (!textContainsEmoji(text)) {
    ops.drawSegment(text, x, y, style);
    return;
  }
  let cursor = x;
  for (const segment of splitPrintTextSegments(text)) {
    if (segment.kind === 'text') {
      ops.drawSegment(segment.value, cursor, y, style);
      cursor += ops.measureSegment(segment.value, style);
    } else {
      cursor += ops.drawEmoji(segment.value, cursor, y, style);
    }
  }
}

/** Underline / strikethrough bars, drawn as rects so they print on every backend. */
function drawTextDecorations(
  text: string,
  x: number,
  y: number,
  style: TextDrawStyle,
  width: number,
  fill: (x: number, y: number, w: number, h: number, gray: number) => void,
): void {
  if ((!style.underline && !style.strikethrough) || !text || !(width > 0)) return;
  const size = style.fontSizeDots;
  const thick = Math.max(1, Math.round(size * (style.bold ? 0.09 : 0.065)));
  const w = Math.max(1, Math.round(width));
  const left = Math.round(x);
  if (style.underline) fill(left, Math.round(y + size * 1.02), w, thick, style.ink);
  if (style.strikethrough) fill(left, Math.round(y + size * 0.68 - thick / 2), w, thick, style.ink);
}

const ITALIC_SKEW = -0.2;

function makeSkiaRasterSurface(widthDots: number, heightDots: number, skiaMod: SkiaModule): RasterSurface {
  const { Skia, matchFont, PaintStyle, ColorType, AlphaType } = skiaMod;
  const surface = Skia.Surface.MakeOffscreen(widthDots, heightDots);
  if (!surface) throw new Error('Skia.Surface.MakeOffscreen returned null');

  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('#FFFFFF'));

  const fillPaint = Skia.Paint();
  fillPaint.setAntiAlias(false);
  const strokePaint = Skia.Paint();
  strokePaint.setAntiAlias(false);
  strokePaint.setStyle(PaintStyle.Stroke);

  const fontCache = new Map<string, SkiaFont>();

  function fontFor(style: TextDrawStyle): SkiaFont {
    const key = `${style.family ?? 'sans-serif'}|${style.fontSizeDots}|${style.bold ? 1 : 0}|${style.italic ? 1 : 0}`;
    let font = fontCache.get(key);
    if (!font) {
      font = matchFont({
        ...(style.family ? { fontFamily: style.family } : {}),
        fontSize: style.fontSizeDots,
        fontWeight: style.bold ? '600' : 'normal',
        fontStyle: 'normal',
      });
      try {
        const { printTypeface } = require('./print-typeface') as {
          printTypeface: (family?: string, bold?: boolean) => { dispose?: () => void } | null;
        };
        const face = printTypeface(style.family, style.bold);
        if (face) {
          font = Skia.Font(face, style.fontSizeDots);
        }
      } catch {
        // Keep matchFont when the embedded face is not loaded yet.
      }
      fontCache.set(key, font);
    }
    return font;
  }

  const emojiSkia = skiaMod as EmojiSkiaModule;

  /**
   * The unset (default) family draws with the system face. If that face cannot measure
   * the text on this device it would print nothing, so fall back to the bundled Inter.
   */
  function fontForText(text: string, style: TextDrawStyle): SkiaFont {
    const font = fontFor(style);
    if (style.family || !text || font.measureText(text).width > 0) return font;
    return fontFor({ ...style, family: 'Inter_400Regular' });
  }

  function measurePlainSegment(text: string, style: TextDrawStyle): number {
    if (!text) return 0;
    if (needsComplexTextShaping(text)) {
      const shaped = measureShapedTextWidth(skiaMod, text, style);
      if (shaped != null) return shaped;
    }
    const natural = fontForText(text, style).measureText(text).width;
    return natural + (style.letterSpacingDots ?? 0) * text.length;
  }

  function drawPlainSegment(text: string, x: number, y: number, style: TextDrawStyle): void {
    if (!text) return;
    if (needsComplexTextShaping(text)) {
      const painted = drawShapedTextLine(skiaMod, canvas, text, x, y, style);
      if (painted) return;
    }
    const font = fontForText(text, style);
    fillPaint.setColor(grayToColor(skiaMod, style.ink));
    fillPaint.setStyle(PaintStyle.Fill);
    fillPaint.setAntiAlias(true);
    const gap = style.letterSpacingDots ?? 0;
    if (!gap) {
      canvas.drawText(text, x, y + style.fontSizeDots, fillPaint, font);
    } else {
      let cursor = x;
      for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i);
        canvas.drawText(ch, cursor, y + style.fontSizeDots, fillPaint, font);
        cursor += font.measureText(ch).width + gap;
      }
    }
    fillPaint.setAntiAlias(false);
  }

  const segmentOps: TextSegmentOps = {
    measureSegment: measurePlainSegment,
    drawSegment: drawPlainSegment,
    measureEmoji: (emoji, style) => measureEmojiSegmentWidth(emojiSkia, emoji, style),
    drawEmoji: (emoji, x, y, style) =>
      canvas.drawImage || canvas.drawImageRect
        ? drawEmojiSegmentAsImage(emojiSkia, canvas, emoji, x, y, style)
        : stampEmojiDots(emojiSkia, ColorType.RGBA_8888, AlphaType.Unpremul, (px, py, w, h, gray) => {
            fillPaint.setColor(grayToColor(skiaMod, gray));
            fillPaint.setStyle(PaintStyle.Fill);
            fillPaint.setAntiAlias(false);
            canvas.drawRect(
              Skia.XYWHRect(Math.round(px), Math.round(py), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))),
              fillPaint,
            );
          }, emoji, x, y, style),
  };

  return {
    backend: 'skia',
    width: widthDots,
    height: heightDots,
    fillRect(x, y, w, h, gray) {
      fillPaint.setColor(grayToColor(skiaMod, gray));
      fillPaint.setStyle(PaintStyle.Fill);
      fillPaint.setAntiAlias(false);
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(1, Math.round(w));
      const rh = Math.max(1, Math.round(h));
      canvas.drawRect(Skia.XYWHRect(rx, ry, rw, rh), fillPaint);
    },
    strokeRect(x, y, w, h, stroke, gray) {
      const t = Math.max(1, Math.round(stroke));
      fillPaint.setColor(grayToColor(skiaMod, gray));
      fillPaint.setStyle(PaintStyle.Fill);
      fillPaint.setAntiAlias(false);
      const rx = Math.round(x);
      const ry = Math.round(y);
      const rw = Math.max(t, Math.round(w));
      const rh = Math.max(t, Math.round(h));
      canvas.drawRect(Skia.XYWHRect(rx, ry, rw, t), fillPaint);
      canvas.drawRect(Skia.XYWHRect(rx, ry + rh - t, rw, t), fillPaint);
      canvas.drawRect(Skia.XYWHRect(rx, ry, t, rh), fillPaint);
      canvas.drawRect(Skia.XYWHRect(rx + rw - t, ry, t, rh), fillPaint);
    },
    fillEllipse(cx, cy, rx, ry, gray) {
      fillPaint.setColor(grayToColor(skiaMod, gray));
      fillPaint.setStyle(PaintStyle.Fill);
      const rxf = Math.max(1, rx);
      const ryf = Math.max(1, ry);
      canvas.drawOval(
        Skia.XYWHRect(cx - rxf, cy - ryf, rxf * 2, ryf * 2),
        fillPaint,
      );
    },
    drawTextLine(text, x, y, style) {
      textDrawLog.push({
        text,
        x,
        y,
        fontSizeDots: style.fontSizeDots,
        family: style.family,
        bold: style.bold,
        italic: style.italic,
        backend: 'skia',
      });
      // The embedded print faces have no italic cut, so slant the line ourselves.
      const slant = !!style.italic && typeof canvas.save === 'function' && typeof canvas.skew === 'function';
      if (slant) {
        canvas.save();
        canvas.translate?.(x, y + style.fontSizeDots);
        canvas.skew?.(ITALIC_SKEW, 0);
        canvas.translate?.(-x, -(y + style.fontSizeDots));
      }
      try {
        drawTextLineMixed(text, x, y, style, segmentOps);
      } finally {
        if (slant) canvas.restore?.();
      }
      drawTextDecorations(text, x, y, style, measureTextLineWidth(text, style, segmentOps), (rx, ry, rw, rh, g) => {
        fillPaint.setColor(grayToColor(skiaMod, g));
        fillPaint.setStyle(PaintStyle.Fill);
        fillPaint.setAntiAlias(false);
        canvas.drawRect(Skia.XYWHRect(rx, ry, rw, rh), fillPaint);
      });
    },
    measureTextWidth(text, style) {
      return measureTextLineWidth(text, style, segmentOps);
    },
    withRotation(cx, cy, degrees, draw) {
      const turns = ((degrees % 360) + 360) % 360;
      if (turns < 1e-4) {
        draw();
        return;
      }
      if (typeof canvas.save !== 'function' || typeof canvas.rotate !== 'function') {
        draw();
        return;
      }
      canvas.save();
      canvas.translate?.(cx, cy);
      canvas.rotate(degrees, 0, 0);
      canvas.translate?.(-cx, -cy);
      try {
        draw();
      } finally {
        canvas.restore?.();
      }
    },
    drawVectorGlyph(ops, x, y, size, gray) {
      if (
        typeof canvas.save !== 'function' ||
        typeof canvas.translate !== 'function' ||
        typeof canvas.scale !== 'function' ||
        typeof canvas.drawPath !== 'function'
      ) {
        return;
      }
      const k = size / 24;
      if (!(k > 0)) return;
      const color = grayToColor(skiaMod, gray);
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setColor(color);
      canvas.save();
      canvas.translate(x, y);
      canvas.scale(k, k);
      try {
        for (const op of ops) {
          const d = clipartOpToSvgPath(op);
          const path = d ? Skia.Path.MakeFromSVGString(d) : null;
          if (!path) continue;
          const filled = op.t !== 'line' && op.fill;
          paint.setStyle(filled ? PaintStyle.Fill : PaintStyle.Stroke);
          // Never thinner than one printer dot, whatever the sticker size.
          if (!filled) paint.setStrokeWidth(Math.max(op.sw, 1 / k));
          canvas.drawPath(path, paint);
        }
      } finally {
        canvas.restore?.();
      }
    },
    drawLineEmojiGlyph(ops, x, y, size, gray) {
      if (
        typeof canvas.save !== 'function' ||
        typeof canvas.translate !== 'function' ||
        typeof canvas.scale !== 'function' ||
        typeof canvas.drawPath !== 'function'
      ) {
        return;
      }
      // Same square the editor viewBox uses, so the print fills the frame
      // instead of the empty 24×24 artboard around the glyph.
      const fit = inkSquare(ops);
      const k = size / fit.side;
      if (!(k > 0)) return;
      const color = grayToColor(skiaMod, gray);
      const paint = Skia.Paint();
      paint.setAntiAlias(false);
      paint.setColor(color);
      if (skiaMod.StrokeCap && paint.setStrokeCap) paint.setStrokeCap(skiaMod.StrokeCap.Round);
      if (skiaMod.StrokeJoin && paint.setStrokeJoin) paint.setStrokeJoin(skiaMod.StrokeJoin.Round);
      canvas.save();
      canvas.translate(x - fit.x * k, y - fit.y * k);
      canvas.scale(k, k);
      if (typeof canvas.clipRect === 'function' && skiaMod.ClipOp) {
        canvas.clipRect(Skia.XYWHRect(fit.x, fit.y, fit.side, fit.side), skiaMod.ClipOp.Intersect, false);
      }
      try {
        for (const op of ops) {
          const filled = op.t !== 'line' && op.fill;
          paint.setStyle(filled ? PaintStyle.Fill : PaintStyle.Stroke);
          // Stroke width stays in viewBox units, same ratio as the canvas SVG.
          if (!filled) paint.setStrokeWidth(op.sw);
          if (op.t === 'circle' && typeof canvas.drawCircle === 'function') {
            canvas.drawCircle(op.x, op.y, op.r, paint);
            continue;
          }
          if (op.t === 'ellipse') {
            canvas.drawOval(
              Skia.XYWHRect(op.x - op.rx, op.y - op.ry, op.rx * 2, op.ry * 2),
              paint,
            );
            continue;
          }
          const d = op.t === 'path' ? separateSvgArcFlags(op.d) : clipartOpToSvgPath(op);
          const path = d ? Skia.Path.MakeFromSVGString(d) : null;
          if (!path) continue;
          canvas.drawPath(path, paint);
        }
      } finally {
        canvas.restore?.();
      }
    },
    readGray() {
      surface.flush();
      const image = surface.makeImageSnapshot();
      const pixels = image.readPixels(0, 0, {
        width: widthDots,
        height: heightDots,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      });
      if (!pixels) throw new Error('Skia readPixels failed');
      return rgbaToGray(pixels, widthDots, heightDots);
    },
  };
}

function makeDotRasterSurface(dot: DotSurface): RasterSurface {
  let rot: { cx: number; cy: number; cos: number; sin: number } | null = null;

  function mapPoint(x: number, y: number): { x: number; y: number } {
    if (!rot) return { x, y };
    const dx = x - rot.cx;
    const dy = y - rot.cy;
    return {
      x: rot.cx + dx * rot.cos - dy * rot.sin,
      y: rot.cy + dx * rot.sin + dy * rot.cos,
    };
  }

  function putDot(x: number, y: number, gray: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= dot.width || iy >= dot.height) return;
    dot.gray[iy * dot.width + ix] = gray < 0 ? 0 : gray > 255 ? 255 : gray;
  }

  function paintRect(x: number, y: number, w: number, h: number, gray: number): void {
    if (!rot) {
      fillRect(dot, x, y, w, h, gray);
      return;
    }
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.ceil(x + w);
    const y1 = Math.ceil(y + h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const p = mapPoint(px + 0.5, py + 0.5);
        putDot(p.x, p.y, gray);
      }
    }
  }

  function paintEllipse(cx: number, cy: number, rx: number, ry: number, gray: number): void {
    if (!rot) {
      fillEllipse(dot, cx, cy, rx, ry, gray);
      return;
    }
    const x0 = Math.floor(cx - rx);
    const y0 = Math.floor(cy - ry);
    const x1 = Math.ceil(cx + rx);
    const y1 = Math.ceil(cy + ry);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const nx = (px + 0.5 - cx) / Math.max(1, rx);
        const ny = (py + 0.5 - cy) / Math.max(1, ry);
        if (nx * nx + ny * ny > 1) continue;
        const p = mapPoint(px + 0.5, py + 0.5);
        putDot(p.x, p.y, gray);
      }
    }
  }

  const skiaForEmoji = loadSkiaModule();
  const emojiSkia = skiaForEmoji as EmojiSkiaModule | null;
  const colorType = skiaForEmoji?.ColorType?.RGBA_8888 ?? 0;
  const alphaType = skiaForEmoji?.AlphaType?.Unpremul ?? 0;

  function measureBlockText(text: string, style: TextDrawStyle): number {
    if (!text) return 0;
    const cellW = Math.max(1, Math.round(style.fontSizeDots * 0.55));
    return text.length * (cellW + (style.letterSpacingDots ?? 0));
  }

  function drawBlockText(text: string, x: number, y: number, style: TextDrawStyle): void {
    const cellW = Math.max(1, Math.round(style.fontSizeDots * 0.55));
    const cellH = Math.max(1, style.fontSizeDots);
    const gap = style.letterSpacingDots ?? 0;
    let cursor = x;
    for (const ch of text) {
      if (ch !== ' ') {
        paintRect(cursor, y, Math.max(1, cellW - 1), Math.max(1, cellH - 1), style.ink);
      }
      cursor += cellW + gap;
    }
  }

  const dotSegmentOps: TextSegmentOps = {
    measureSegment: measureBlockText,
    drawSegment: drawBlockText,
    measureEmoji: (emoji, style) =>
      emojiSkia
        ? measureEmojiSegmentWidth(emojiSkia, emoji, style)
        : Math.max(1, Math.round(style.fontSizeDots * 0.9)),
    drawEmoji: (emoji, x, y, style) => {
      if (emojiSkia) {
        return stampEmojiDots(emojiSkia, colorType, alphaType, paintRect, emoji, x, y, style);
      }
      const w = Math.max(1, Math.round(style.fontSizeDots * 0.9));
      paintRect(x, y, w, Math.max(1, style.fontSizeDots), style.ink);
      return w;
    },
  };

  return {
    backend: 'dot-buffer',
    width: dot.width,
    height: dot.height,
    fillRect: paintRect,
    strokeRect(x, y, w, h, stroke, gray) {
      if (!rot) {
        strokeRect(dot, x, y, w, h, stroke, gray);
        return;
      }
      const t = Math.max(1, Math.round(stroke));
      paintRect(x, y, w, t, gray);
      paintRect(x, y + h - t, w, t, gray);
      paintRect(x, y, t, h, gray);
      paintRect(x + w - t, y, t, h, gray);
    },
    fillEllipse: paintEllipse,
    drawTextLine(text, x, y, style) {
      textDrawLog.push({
        text,
        x,
        y,
        fontSizeDots: style.fontSizeDots,
        family: style.family,
        bold: style.bold,
        italic: style.italic,
        backend: 'dot-buffer',
      });
      drawTextLineMixed(text, x, y, style, dotSegmentOps);
      drawTextDecorations(text, x, y, style, measureTextLineWidth(text, style, dotSegmentOps), paintRect);
    },
    measureTextWidth(text, style) {
      return measureTextLineWidth(text, style, dotSegmentOps);
    },
    withRotation(cx, cy, degrees, draw) {
      const turns = ((degrees % 360) + 360) % 360;
      if (turns < 1e-4) {
        draw();
        return;
      }
      const rad = (degrees * Math.PI) / 180;
      const prev = rot;
      rot = { cx, cy, cos: Math.cos(rad), sin: Math.sin(rad) };
      try {
        draw();
      } finally {
        rot = prev;
      }
    },
    readGray() {
      return dot.gray;
    },
  };
}

/** First MakeOffscreen on device is slow; call once when the Print screen opens. */
export function warmupPrintRasterSurface(): void {
  try {
    makeOffscreenSurface(64, 64);
  } catch {
    // Print path creates its own surface.
  }
}

export function makeOffscreenSurface(
  widthDots: number,
  heightDots: number,
  backend?: RasterSurfaceBackend,
): RasterSurface {
  if (backend === 'dot-buffer') {
    return makeDotRasterSurface(makeDotSurface(widthDots, heightDots));
  }
  const skiaMod = loadSkiaModule();
  const makeOffscreen = skiaMod?.Skia?.Surface?.MakeOffscreen;
  if (typeof makeOffscreen === 'function') {
    try {
      return makeSkiaRasterSurface(widthDots, heightDots, skiaMod!);
    } catch {
      if (backend === 'skia') {
        throw new Error('Skia.Surface.MakeOffscreen failed');
      }
    }
  }
  if (backend === 'skia') {
    throw new Error('Skia.Surface.MakeOffscreen is not a function');
  }
  return makeDotRasterSurface(makeDotSurface(widthDots, heightDots));
}

export function activeRasterizerBackend(): RasterSurfaceBackend {
  const skiaMod = loadSkiaModule();
  if (typeof skiaMod?.Skia?.Surface?.MakeOffscreen !== 'function') return 'dot-buffer';
  try {
    const probe = skiaMod!.Skia.Surface.MakeOffscreen(8, 8);
    return probe ? 'skia' : 'dot-buffer';
  } catch {
    return 'dot-buffer';
  }
}

export function probeSkiaOffscreen(): boolean {
  const skiaMod = loadSkiaModule();
  return typeof skiaMod?.Skia?.Surface?.MakeOffscreen === 'function';
}

/** On-device GATE-A probe: API presence + 600×360 fixture surface creation. */
export function probeSkiaOffscreenDetailed(): SkiaOffscreenProbe {
  const skiaMod = loadSkiaModule();
  const makeOffscreen = skiaMod?.Skia?.Surface?.MakeOffscreen;
  const backend = activeRasterizerBackend();
  const apiAvailable = typeof makeOffscreen === 'function';
  if (!apiAvailable) {
    return {
      apiAvailable: false,
      create600x360: false,
      rasterizerBackend: backend,
      error: 'Skia.Surface.MakeOffscreen is not a function',
    };
  }
  try {
    const surface = makeOffscreen!(FIXTURE_W, FIXTURE_H);
    if (!surface) {
      return {
        apiAvailable: true,
        create600x360: false,
        rasterizerBackend: backend,
        error: 'MakeOffscreen returned null',
      };
    }
    const w = surface.width?.();
    const h = surface.height?.();
    if (w !== FIXTURE_W || h !== FIXTURE_H) {
      return {
        apiAvailable: true,
        create600x360: false,
        rasterizerBackend: backend,
        error: `MakeOffscreen size mismatch: got ${w}×${h}, expected ${FIXTURE_W}×${FIXTURE_H}`,
      };
    }
    return {
      apiAvailable: true,
      create600x360: true,
      rasterizerBackend: backend,
    };
  } catch (err) {
    return {
      apiAvailable: true,
      create600x360: false,
      rasterizerBackend: backend,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
