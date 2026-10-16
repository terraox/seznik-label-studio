/**
 * TSC / TSPL label job builder for TD-404 / Ninestar printers.
 * Matches the vendor demo flow (LabelCommand → SIZE/GAP/CLS/BITMAP/PRINT).
 */

import type { BitRaster } from '@/lib/printer/escpos';
import {
  DEFAULT_PRINTER_PROFILE,
  dotsPerMm,
  formatTsplSizeCommand,
  mediaOriginXMm,
} from '@/lib/printer/print-spec';
import { td404MediaLine, type PaperMedia } from '@/lib/printer/paper-type';
import { clampTd404Density, clampTd404GapMm, clampTd404Speed } from '@/lib/printer/td404-job-params';

export type TscJobOptions = {
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  copies?: number;
  density?: number | null;
  /** TSPL SPEED 1–7. Higher is faster feed. Default 3. */
  speed?: number | null;
  /** Dot offset for BITMAP x,y */
  x?: number;
  y?: number;
  /**
   * Media sensor: gap (default), black-mark (BLINE), or continuous.
   * Wrong mode causes overlapping prints on one physical label.
   */
  media?: 'gap' | 'bline' | 'continuous';
};

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function mediaCommand(media: TscJobOptions['media'], gapMm: number): string {
  const kind: PaperMedia = media === 'bline' || media === 'continuous' ? media : 'gap';
  return td404MediaLine(kind, gapMm);
}

/**
 * Encode a 1-bit packed raster as a full TSPL job with BITMAP payload.
 * Mode 0 = OVERWRITE. Emits PRINT 1 — callers that need N copies must
 * send N independent jobs or specify copies in the print manager.
 *
 * Single-allocation zero-copy: inverts raster directly into output buffer
 * without allocating intermediate 250KB payloads or multi-array concatenation.
 *
 * DIRECTION 0,0 keeps the same top-left origin as the editor preview so
 * alignment matches on-screen layout (DIRECTION 1 flips print vs preview).
 * Calibration is REFERENCE (signed dots). BITMAP stays 0,0 so negatives do not clip.
 */
export function encodeTscBitmapJob(bitmap: BitRaster, options: TscJobOptions): Uint8Array {
  const media = options.media ?? 'gap';
  const gap = media === 'continuous' ? 0 : clampTd404GapMm(options.gapMm);
  const density = clampTd404Density(options.density);
  const speed = clampTd404Speed(options.speed);
  const x = options.x ?? 0;
  const y = options.y ?? 0;

  const sizeCmd = formatTsplSizeCommand(options.widthMm, options.heightMm);
  const mediaCmd = mediaCommand(media, gap);

  const bitmapCmd = `BITMAP 0,0,${bitmap.bytesPerRow},${bitmap.height},0`;
  console.info(
    '[tsc] TSPL job:',
    sizeCmd, '|',
    mediaCmd.trim(), '|',
    `REFERENCE ${x},${y}`, '|',
    bitmapCmd, '|',
    'SPEED', speed, '| DENSITY', density, '|',
    'payload:', bitmap.data.length, 'bytes',
    '| BITMAP width is byte-width', bitmap.bytesPerRow,
    'not pixel width', bitmap.bytesPerRow * 8,
  );

  const header =
    '\r\n' +
    `${sizeCmd}\r\n` +
    mediaCmd +
    `SPEED ${speed}\r\n` +
    `DENSITY ${density}\r\n` +
    'DIRECTION 0,0\r\n' +
    'OFFSET 0 mm\r\n' +
    `REFERENCE ${x},${y}\r\n` +
    'CLS\r\n' +
    `BITMAP 0,0,${bitmap.bytesPerRow},${bitmap.height},0,`;

  const footer = '\r\nPRINT 1\r\n';

  const headerLen = header.length;
  const dataLen = bitmap.data.length;
  const footerLen = footer.length;
  const out = new Uint8Array(headerLen + dataLen + footerLen);

  // 1. Write header directly
  for (let i = 0; i < headerLen; i++) out[i] = header.charCodeAt(i) & 0xff;

  // 2. Invert directly into output buffer (zero intermediate allocation)
  const src = bitmap.data;
  for (let i = 0; i < dataLen; i++) {
    out[headerLen + i] = src[i] ^ 0xff;
  }

  // 3. Write footer directly
  const footerOffset = headerLen + dataLen;
  for (let i = 0; i < footerLen; i++) out[footerOffset + i] = footer.charCodeAt(i) & 0xff;

  return out;
}

export type TsplJobInspection = {
  sizeCommand: string;
  gapCommand: string;
  directionCommand: string;
  referenceCommand: string;
  bitmapCommand: string;
  bitmapX: number;
  bitmapY: number;
  bitmapWidthBytes: number;
  bitmapHeightDots: number;
  payloadBytes: number;
  totalBytes: number;
  header: string;
};

/** Parse the TSPL ASCII header that this encoder actually wrote. */
export function inspectTsplJob(bytes: Uint8Array): TsplJobInspection {
  const { text, payloadStart } = readTsplHeader(bytes);
  const footerLen = '\r\nPRINT 1\r\n'.length;
  const sizeCommand = matchLine(text, /^SIZE .+$/m) ?? '';
  const gapCommand = matchLine(text, /^(GAP|BLINE) .+$/m) ?? '';
  const directionCommand = matchLine(text, /^DIRECTION .+$/m) ?? '';
  const referenceCommand = matchLine(text, /^REFERENCE .+$/m) ?? '';
  const bitmapMatch = text.match(/BITMAP\s+(-?\d+),(-?\d+),(\d+),(\d+),(\d+)/);
  const bitmapCommand = bitmapMatch ? bitmapMatch[0] : '';
  return {
    sizeCommand,
    gapCommand,
    directionCommand,
    referenceCommand,
    bitmapCommand,
    bitmapX: Number(bitmapMatch?.[1] ?? 0),
    bitmapY: Number(bitmapMatch?.[2] ?? 0),
    bitmapWidthBytes: Number(bitmapMatch?.[3] ?? 0),
    bitmapHeightDots: Number(bitmapMatch?.[4] ?? 0),
    payloadBytes: Math.max(0, bytes.length - payloadStart - footerLen),
    totalBytes: bytes.length,
    header: text,
  };
}

function matchLine(text: string, re: RegExp): string | undefined {
  return text.match(re)?.[0]?.trim();
}

function readTsplHeader(bytes: Uint8Array): { text: string; payloadStart: number } {
  let text = '';
  const limit = Math.min(bytes.length, 800);
  for (let i = 0; i < limit; i++) {
    const c = bytes[i];
    if (c < 9 || c > 126) {
      return { text, payloadStart: i };
    }
    text += String.fromCharCode(c);
    // BITMAP x,y,byteWidth,height,mode, — do not stop at BITMAP x,y,
    if (/BITMAP\s+-?\d+,-?\d+,\d+,\d+,\d+,$/.test(text)) {
      return { text, payloadStart: i + 1 };
    }
  }
  return { text, payloadStart: limit };
}

/** TSC built-in font "1" at 1×1 is ~12 dots tall; step must exceed that to avoid overlap. */
const TSC_FONT1_HEIGHT_DOTS = 12;
const COMPACT_TEXT_MARGIN_TOP_MM = 1;
const COMPACT_TEXT_MARGIN_BOTTOM_MM = 0.5;
const COMPACT_TEXT_MIN_LINE_STEP_MM = 2.8;

export function layoutTscCompactTextLines(options: {
  lineCount: number;
  heightMm: number;
  dpi?: number;
}): { startY: number; lineStep: number } {
  const dpi = options.dpi ?? DEFAULT_PRINTER_PROFILE.dpi;
  const dpm = dotsPerMm(dpi);
  const count = Math.max(1, options.lineCount);
  const innerMm = Math.max(
    COMPACT_TEXT_MIN_LINE_STEP_MM,
    options.heightMm - COMPACT_TEXT_MARGIN_TOP_MM - COMPACT_TEXT_MARGIN_BOTTOM_MM,
  );
  const distributedStep = Math.round((innerMm / count) * dpm);
  const minStep = Math.max(
    TSC_FONT1_HEIGHT_DOTS + 2,
    Math.round(COMPACT_TEXT_MIN_LINE_STEP_MM * dpm),
  );
  return {
    startY: Math.round(COMPACT_TEXT_MARGIN_TOP_MM * dpm),
    lineStep: Math.max(minStep, distributedStep),
  };
}

/**
 * Left-aligned, small-type TSPL text for narrow strips (50×15 mm, 25×25 mm corner).
 * Uses font "1" at 1×1; line spacing is derived from label height (304 DPI / 12 dpm).
 */
export function encodeTscCompactTextSample(options: {
  lines: readonly string[];
  widthMm?: number;
  heightMm?: number;
  gapMm?: number;
  density?: number;
  dpi?: number;
  profile?: typeof DEFAULT_PRINTER_PROFILE;
}): Uint8Array {
  const widthMm = options.widthMm ?? 50;
  const heightMm = options.heightMm ?? 15;
  const gapMm = options.gapMm ?? 2;
  const density = options.density ?? 8;
  const profile = options.profile ?? DEFAULT_PRINTER_PROFILE;
  const dpi = options.dpi ?? profile.dpi;
  const dpm = dotsPerMm(dpi);
  const refX = Math.round(mediaOriginXMm(profile) * dpm);
  const safeLines = options.lines
    .map((line) => String(line).replace(/"/g, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 4);
  const { startY, lineStep } = layoutTscCompactTextLines({
    lineCount: safeLines.length,
    heightMm,
    dpi,
  });
  const x = Math.round(1 * dpm);
  let y = startY;
  let textBlock = '';
  for (const line of safeLines) {
    const safe = line.slice(0, 32);
    textBlock += `TEXT ${x},${y},"1",0,1,1,"${safe}"\r\n`;
    y += lineStep;
  }
  const mediaCmd = mediaCommand('gap', gapMm);
  const cmd =
    '\r\n' +
    `${formatTsplSizeCommand(widthMm, heightMm)}\r\n` +
    mediaCmd +
    'SPEED 5\r\n' +
    `DENSITY ${density}\r\n` +
    'DIRECTION 0,0\r\n' +
    'OFFSET 0 mm\r\n' +
    `REFERENCE ${refX},0\r\n` +
    'CLS\r\n' +
    textBlock +
    'PRINT 1\r\n';
  return ascii(cmd);
}

/** Simple text-only sample label (no bitmap) — good for connection smoke tests. */
export function encodeTscTextSample(options: {
  widthMm?: number;
  heightMm?: number;
  gapMm?: number;
  text?: string;
  density?: number;
}): Uint8Array {
  const widthMm = options.widthMm ?? 50;
  const heightMm = options.heightMm ?? 30;
  const gapMm = options.gapMm ?? 2;
  const density = options.density ?? 8;
  const text = String(options.text ?? 'Sez Print TD-404').replace(/"/g, '');
  const cmd =
    '\r\n' +
    `${formatTsplSizeCommand(widthMm, heightMm)}\r\n` +
    td404MediaLine('gap', gapMm) +
    'SPEED 5\r\n' +
    `DENSITY ${density}\r\n` +
    'DIRECTION 0,0\r\n' +
    'REFERENCE 0,0\r\n' +
    'CLS\r\n' +
    `TEXT 40,40,"0",0,1,1,"${text}"\r\n` +
    'PRINT 1\r\n';
  return ascii(cmd);
}
