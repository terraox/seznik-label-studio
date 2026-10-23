/**
 * Test fixtures for .sezlabel. Built in code, no golden files. Fake "phone" file system and envs.
 */

import { encode as encodePng } from 'fast-png';

import { DRAWING_COLORS } from '@/components/editor/types';
import type { LabelDocument, LabelElement } from '@/lib/label-document';
import type { ExportEnv, UserClipartSource } from '../export';
import type { ImportEnv } from '../import';
import type { PlacedImage, Placement } from '../finalize';

export const APP_VERSION = '1.0.1';

/** A real, decodable grayscale PNG. */
export function makePng(width: number, height: number, seed = 0): Uint8Array {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = (x * 5 + y * 3 + seed * 17) & 255;
  return encodePng({ width, height, data, channels: 1, depth: 8 });
}

/** A header-valid JPEG stub (enough for sniffing; not decodable). */
export function makeJpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

/** A minimal table-directory-valid TrueType font stub (enough for the sniffer; not drawable). */
export function makeFont(kind: 'ttf' | 'otf' = 'ttf', size = 400): Uint8Array {
  const tables = ['cmap', 'head', 'hhea', 'maxp', kind === 'ttf' ? 'glyf' : 'CFF '];
  const out = new Uint8Array(Math.max(size, 12 + tables.length * 16 + 8));
  const dv = new DataView(out.buffer);
  if (kind === 'ttf') dv.setUint32(0, 0x00010000);
  else out.set([0x4f, 0x54, 0x54, 0x4f], 0);
  dv.setUint16(4, tables.length);
  tables.forEach((t, i) => {
    const rec = 12 + i * 16;
    out.set([...t].map((c) => c.charCodeAt(0)), rec);
    dv.setUint32(rec + 8, 12 + tables.length * 16);
    dv.setUint32(rec + 12, 8);
  });
  return out;
}

export const SAFE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#000" stroke-width="2"><path d="M4 12h16"/><circle cx="12" cy="12" r="8"/></g></svg>';

export class FakePhone {
  files = new Map<string, Uint8Array>();
  userClipart = new Map<string, UserClipartSource>();
  /** Fonts the user imported on this phone, by the name labels store. */
  importedFonts = new Map<string, Uint8Array>();
  put(uri: string, bytes: Uint8Array) {
    this.files.set(uri, bytes);
    return uri;
  }
  exportEnv(over: Partial<ExportEnv> = {}): ExportEnv {
    return {
      appVersion: APP_VERSION,
      palette: DRAWING_COLORS,
      now: () => 1_790_000_000_000,
      readImage: async (uri) => this.files.get(uri) ?? null,
      readReferenceImage: async (name) =>
        this.files.get(`file:///sezprint/images/${name}`) ?? this.files.get(`file:///recv/sezprint/images/${name}`) ?? null,
      getUserClipart: async (id) => this.userClipart.get(id) ?? null,
      includeUserClipart: true,
      includeFonts: true,
      getImportedFont: async (name) => this.importedFonts.get(name) ?? null,
      preview: null,
      ...over,
    };
  }
}

let counter = 0;
export const newTestId = () => `n_${(counter += 1)}`;

export function importEnv(over: Partial<ImportEnv> = {}): ImportEnv {
  return {
    appVersion: APP_VERSION,
    palette: DRAWING_COLORS,
    isKnownClipartId: (id) => id.startsWith('builtin-'),
    isKnownBorderStyle: (id) => id === 'solid-thin' || id === 'dashed',
    isFontAvailable: (name) => name === 'Default' || name === 'Barcode' || name === 'Inter',
    newId: newTestId,
    ...over,
  };
}

/** Where a fake import wrote every picture: copies of the shipped bytes under a new "phone" path. */
export function fakePlacement(
  parsed: { assets: Map<string, { kind: string; bytes: Uint8Array; width?: number; height?: number; ext: string }>; usedAssets: Set<string>; userClipart: { oldId: string; label: string }[] },
  target: FakePhone,
): Placement {
  const images = new Map<string, PlacedImage>();
  let n = 0;
  for (const path of parsed.usedAssets) {
    const asset = parsed.assets.get(path);
    if (!asset || asset.kind !== 'image') continue;
    n += 1;
    const printUri = target.put(`file:///recv/sezprint/images/imp${n}-print.${asset.ext}`, asset.bytes);
    // The rebuilt working copy is a different file (here: a different stub) and must never be printed.
    const uri = target.put(`file:///recv/sezprint/images/imp${n}-preview.jpg`, makeJpeg(10, 10));
    images.set(path, {
      printUri,
      uri,
      workingWidthPx: 10,
      workingHeightPx: 10,
      widthPx: asset.width ?? 1,
      heightPx: asset.height ?? 1,
      fileName: `imp${n}-print.${asset.ext}`,
    });
  }
  const clipartIds = new Map<string, string>();
  for (const c of parsed.userClipart) clipartIds.set(c.oldId, `svg_new_${c.oldId}`);
  return { id: 'label_new', name: 'placed', now: 1_800_000_000_000, images, clipartIds };
}

// ───────────────────────────── the full document ─────────────────────────────

export const SERIAL = {
  v: 1,
  id: 'ser_1',
  kind: 'alnum',
  start: 'A001',
  step: '1',
  prefix: 'P-',
  suffix: '-X',
  minWidth: 4,
  padChar: '0',
  decimals: 2,
  rounding: 'down',
  letterCase: 'upper',
  excluded: 'IOQ',
  alphabet: '0123456789ABCDEF',
  repeatEach: 2,
  overflow: 'wrap',
  checkDigit: 'mod10',
  linkTo: 'ser_0',
} as const;

const base = (id: string, left: number, extra: Record<string, unknown> = {}) => ({
  id,
  rotation: 90,
  left,
  top: 4.5,
  lockMovement: true,
  needPrinting: true,
  opacity: 0.8,
  zIndex: 5,
  visible: true,
  ...extra,
});

const font = {
  fontFamily: 'Inter',
  fontSize: 9.5,
  bold: true,
  italic: true,
  underline: true,
  strikethrough: true,
};

export function allElements(imagePrintUri: string, imageUri: string): LabelElement[] {
  const els: Record<string, unknown>[] = [
    {
      ...base('t1', 3.25),
      type: 'text', text: 'Hello\nWorld', ...font, align: 'center', width: 30.5, height: 12,
      antiColor: true, drawingColorIndex: 3, contentType: 'Degrees', serial: { ...SERIAL },
      columnNameContent: 'Name', charSpacing: 0.4, lineSpacing: '1.5', autoWrapping: 'Char',
      verticalDisplay: true, autoTextHeight: false, degreesOffset: 2,
      futureField: { keep: ['me', 1] },
    },
    {
      ...base('b1', 1),
      type: 'barcode', contentType: 'Manual', serial: { ...SERIAL, id: 'ser_b' }, content: '5901234123457',
      columnNameContent: 'sku', encodeMode: 'EAN-13', textFlag: 'Top', ...font, fontFamily: 'Barcode', align: 'right',
      width: 40, height: 14, antiColor: true, drawingColorIndex: 1,
    },
    {
      ...base('q1', 2),
      type: 'qrcode', contentType: 'Data Source', serial: { ...SERIAL, id: 'ser_q' }, content: 'https://seznik.in/x',
      encodeMode: 'QRCode', errorLevel: 'H', zoneSize: '2', codeShape: 'Square', degreesOffset: 3,
      columnNameContent: 'url', width: 14, height: 14, antiColor: true, drawingColorIndex: 2,
    },
    { ...base('l1', 5), type: 'line', lineStyle: 'dashed', virtualInterval: 1.5, width: 20, height: 0.6, drawingColorIndex: 4 },
    {
      ...base('s1', 6),
      type: 'shape', figureShape: 'roundedRectangle', fill: true, fillColor: '#E53935', lineWidth: 1.2,
      roundRadius: 3, width: 20, height: 12, drawingColorIndex: 5,
    },
    {
      ...base('tb1', 7),
      type: 'table', lineWidth: 0.5, rowCount: 2, columnCount: 2, rowHeights: [9, 11], columnWidths: [18, 22],
      width: 40, height: 20, drawingColorIndex: 1,
      cells: [0, 1].map((r) =>
        [0, 1].map((c) => ({
          text: `r${r}c${c}`, fontSize: 7 + c, fontFamily: 'Inter', bold: c === 1, italic: r === 1, underline: false,
          strikethrough: true, align: 'right', contentType: 'Degrees', columnNameContent: `col${c}`, charSpacing: 0.1,
          lineSpacing: '2.0', autoWrapping: 'Close', verticalDisplay: true, antiColor: r === 1, drawingColorIndex: 2,
          degreesOffset: 4, ...(r === 0 && c === 0 ? { serial: { ...SERIAL, id: 'ser_cell' } } : {}),
        })),
      ),
    },
    {
      ...base('tm1', 8),
      type: 'time', offsetDay: 1, offsetHour: -2, offsetMinute: 30, offsetSecond: 5, ...font, align: 'left',
      width: 32, height: 6, antiColor: true, drawingColorIndex: 1,
    },
    {
      ...base('a1', 9),
      type: 'arctext', contentType: 'Manual', serial: { ...SERIAL, id: 'ser_a' }, degreesOffset: 7,
      columnNameContent: 'arc', text: 'ARC', lineWidth: 0.3, ...font, width: 20, height: 20, antiColor: true, drawingColorIndex: 1,
    },
    {
      ...base('d1', 10),
      type: 'degrees', contentType: 'Degrees', serial: { ...SERIAL, id: 'ser_d' }, degreesOffset: 5, content: '015',
      columnNameContent: 'num', charSpacing: 0.2, lineSpacing: 'Custom', autoWrapping: 'Word', verticalDisplay: false,
      autoTextHeight: true, ...font, align: 'justify', width: 25, height: 8, antiColor: false, drawingColorIndex: 1,
    },
    {
      ...base('i1', 11),
      type: 'image', uri: imageUri, printUri: imagePrintUri, width: 20, height: 10, antiColor: true, flipH: true, flipV: true,
      contentFit: 'cover', colorMode: 'Halftone', grayThreshold: 140, tile: true, contentType: 'Local Image',
      columnNameContent: 'pic', aspectRatioLocked: false, originalAspect: 2, workingWidthPx: 80, workingHeightPx: 40,
      fitLabelSource: true, imageMode: 'floyd', threshold: 120, brightness: 10, contrast: -10, invert: true,
    },
    {
      ...base('c1', 12),
      type: 'clipart', clipartId: 'svg_user1', symbol: 'sym', glyph: 'g', width: 10, height: 10, drawingColorIndex: 1,
      tile: true, colorMode: 'B & W', grayThreshold: 99, strokeScale: 1.5,
    },
    {
      ...base('c2', 13),
      type: 'clipart', clipartId: 'builtin-star', width: 8, height: 8, drawingColorIndex: 1,
    },
    {
      ...base('bo1', 0, { rotation: 0 }),
      type: 'border', borderStyle: 'solid-thin', lineWidth: 0.5, geometryVersion: 1, edgeGapMm: 1.5,
      top: 2, width: 96, height: 56, drawingColorIndex: 1,
    },
    {
      ...base('sg1', 14),
      type: 'signature', width: 20, height: 10, drawingColorIndex: 1, colorMode: 'Original', grayThreshold: 111,
      strokes: [{ points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }], strokeWidth: 0.02 }],
    },
  ];
  // Border first among equals would be re-sorted by the renderer; keep the array order exactly as authored.
  return els as unknown as LabelElement[];
}

export const ALL_TYPES = ['text', 'barcode', 'qrcode', 'line', 'shape', 'table', 'time', 'arctext', 'degrees', 'image', 'clipart', 'border', 'signature'];

export function fullDocument(phone: FakePhone): LabelDocument {
  const printUri = phone.put('file:///sender/sezprint/images/a-print.png', makePng(64, 32, 1));
  const imageUri = phone.put('file:///sender/sezprint/images/a-preview.jpg', makeJpeg(32, 16));
  const bgUri = phone.put('file:///sender/sezprint/images/bg.png', makePng(16, 16, 2));
  phone.put('file:///sezprint/images/ref.png', makePng(40, 20, 3));
  phone.userClipart.set('svg_user1', { id: 'svg_user1', label: 'My star', kind: 'svg', svg: SAFE_SVG });
  const elements = allElements(printUri, imageUri);
  const text = (id: string, left: number) =>
    ({ ...(elements[0] as object), id, left, serial: undefined, contentType: 'Manual' }) as unknown as LabelElement;
  return {
    id: 'label_sender',
    name: 'Full label',
    widthMm: 100,
    heightMm: 60,
    orientation: 90,
    paperType: 'Receipt',
    mediaShape: 'diecut',
    mediaGeometry: {
      type: 'rat_tail', bodyWidthMm: 63.5, bodyHeightMm: 14.3, tailLengthMm: 36.5, tailHeightMm: 4,
      tailPosition: 'left', cornerRadiusMm: 1.15,
    },
    elements,
    groupId: 'group_1',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    background: { type: 'image', uri: bgUri },
    templatePreviewType: 'jew-test',
    templateCategory: 'Jewelry',
    templateSvg: { xml: SAFE_SVG },
    ups: {
      columns: 2, columnSpacingMm: -0.5, batchEdit: true, activeIndex: 1,
      panels: [[text('u0', 1)], [text('u1', 2)]],
    },
    upsTile: { shape: 'circle', columns: 2, gapMm: 1, cellWidthMm: 20, cellHeightMm: 20, originXMm: 0.5, originYMm: 0.25 },
    serialBatch: { v: 1, count: 12 },
    bulk: {
      excelFileId: 'xls_secret',
      sheetIndex: 1,
      rowCount: 3,
      slots: [{ id: 'col:0', columnIndex: 0, columnName: 'Name', kind: 'text' }],
      slotTemplates: { 'col:0': { ...(elements[0] as object), id: 'tpl0', serial: undefined, contentType: 'Data Source' } as unknown as LabelElement },
      sharedGeometry: { 'col:0': { left: 1, top: 2, width: 30, height: 8 } },
      rowGeometryOverrides: { '1': { 'col:0': { left: 2, top: 3, width: 31, height: 9 } } },
      rowContentOverrides: { '0': { 'col:0': 'SECRET-PHONE-9876543210' } },
      activeRowIndex: 2,
      barcodeEncodeMode: 'CODE-39',
      qrErrorLevel: 'Q',
      displayHead: true,
      copiesColumnIndex: 4,
      rowCopiesOverrides: { '2': 5 },
    },
    settings: {
      mirrorMode: 'Syntropy', flagLabel: true, mirrorRowsCount: 3, mirrorSpacingMm: 1.5, mirrorRowNumber: 2,
      gapLengthMm: 9, printDarkness: 7, printSpeed: 3, hOffsetMm: 0.4, vOffsetMm: -0.3, elementsOffsetXMm: 1,
      elementsOffsetYMm: 2, borderOffsetXMm: 0.5, borderOffsetYMm: 0.5, flipHorizontally: true, antiColor: true,
      defaultDrawingColorIndex: 3, dataSourceFileId: 'xls_secret', printGrid: true, printGridSpacingMm: 7, printRuler: true,
    },
    referenceImage: { fileName: 'ref.png', widthPx: 40, heightPx: 20, rotation: 90, needPrinting: true },
  } as unknown as LabelDocument;
}
