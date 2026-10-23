/**
 * Hand-written schema for the document inside a .seznik (document.json).
 *
 * Rules (see docs/sezlabel-schema-plan.md):
 *  - Values are clamped to sane ranges. ELEMENTS ARE NEVER MOVED OR RESIZED to fit the label.
 *  - A known field with the wrong type takes the field default and adds a warning.
 *  - A missing field takes the default only when the app's own type makes it non-optional.
 *  - Unknown fields are kept (so a newer app's extras survive) after JSON safety checks.
 *  - An unknown element type is skipped and listed. An element missing left/top/width is skipped.
 *  - Every file reference must be `assets/...` and present in the package; nothing else is kept.
 * Pure TypeScript: no React Native imports.
 */

import {
  DEFAULT_ARCTEXT_STATE,
  DEFAULT_BARCODE_STATE,
  DEFAULT_DEGREES_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_LINE_STATE,
  DEFAULT_QRCODE_STATE,
  DEFAULT_SHAPE_STATE,
  DEFAULT_TIME_STATE,
  divideTableColumnWidths,
  divideTableRowHeights,
} from '@/components/editor/types';
import { createDefaultTableCell, resizeTableCells } from '@/lib/editor/table-cells';
import { readPaperType, type LabelDocument, type LabelElement } from '@/lib/label-document';
import { LIMITS } from './limits';
import { sanitizeSvgStrict } from './svg-strict';
import { ShareFormatError } from './zip';

// ───────────────────────────── field specs ─────────────────────────────

type Spec =
  | { k: 'num'; min: number; max: number; def?: number; opt?: boolean; int?: boolean; wrap360?: boolean }
  | { k: 'bool'; def?: boolean; opt?: boolean }
  | { k: 'str'; max: number; def?: string; opt?: boolean }
  | { k: 'enum'; values: readonly string[]; def?: string; opt?: boolean };

const num = (min: number, max: number, def?: number): Spec => ({ k: 'num', min, max, def });
const int = (min: number, max: number, def?: number): Spec => ({ k: 'num', min, max, def, int: true });
const optNum = (min: number, max: number): Spec => ({ k: 'num', min, max, opt: true });
const optInt = (min: number, max: number): Spec => ({ k: 'num', min, max, opt: true, int: true });
const bool = (def?: boolean): Spec => ({ k: 'bool', def });
const optBool = (): Spec => ({ k: 'bool', opt: true });
const str = (def?: string, max: number = LIMITS.stringChars): Spec => ({ k: 'str', max, def });
const optStr = (max: number = LIMITS.stringChars): Spec => ({ k: 'str', max, opt: true });
const oneOf = (values: readonly string[], def?: string): Spec => ({ k: 'enum', values, def });
const optOneOf = (values: readonly string[]): Spec => ({ k: 'enum', values, opt: true });

const CONTENT_TYPES = ['Manual', 'Degrees', 'Data Source'] as const;
const ALIGNS = ['left', 'center', 'right', 'justify', 'spacing'] as const;
const LINE_SPACINGS = ['1.0', '1.5', '2.0', 'Custom'] as const;
const WRAPS = ['Close', 'Char', 'Word'] as const;
const COLOR_MODES = ['Original', 'B & W', 'Halftone'] as const;

const COMMON: Record<string, Spec> = {
  rotation: { k: 'num', min: 0, max: 360, def: 0, wrap360: true },
  left: num(-1000, 1000),
  top: num(-1000, 1000),
  width: num(0, 2000),
  lockMovement: bool(false),
  needPrinting: bool(true),
  opacity: optNum(0, 1),
  zIndex: optInt(-1_000_000, 1_000_000),
  visible: optBool(),
};

const inkFields = (d: { antiColor?: boolean; drawingColorIndex?: number }, anti = true): Record<string, Spec> => ({
  ...(anti ? { antiColor: bool(d.antiColor ?? false) } : {}),
  drawingColorIndex: int(0, 99, d.drawingColorIndex ?? 0),
});

const fontFields = (d: {
  fontSize: number;
  fontFamily: string;
  align?: string;
}, withAlign = true): Record<string, Spec> => ({
  fontSize: num(1, 400, d.fontSize),
  fontFamily: str(d.fontFamily, 200),
  bold: bool(false),
  italic: bool(false),
  underline: bool(false),
  strikethrough: bool(false),
  ...(withAlign ? { align: oneOf(ALIGNS, d.align ?? 'left') } : {}),
});

const flowFields = (): Record<string, Spec> => ({
  charSpacing: num(-50, 100, 0),
  lineSpacing: oneOf(LINE_SPACINGS, '1.0'),
  autoWrapping: oneOf(WRAPS, 'Word'),
  verticalDisplay: bool(false),
});

const contentFields = (): Record<string, Spec> => ({
  contentType: oneOf(CONTENT_TYPES, 'Manual'),
  columnNameContent: str('', 200),
});

const imageColorFields = (): Record<string, Spec> => ({
  colorMode: optOneOf(COLOR_MODES),
  grayThreshold: optNum(0, 255),
});

export const ELEMENT_SPECS: Record<string, Record<string, Spec>> = {
  text: {
    ...COMMON,
    height: optNum(0, 2000),
    text: str(DEFAULT_ELEMENT_STATE.text),
    ...fontFields(DEFAULT_ELEMENT_STATE),
    ...inkFields(DEFAULT_ELEMENT_STATE),
    ...contentFields(),
    ...flowFields(),
    autoTextHeight: bool(true),
    // Hidden legacy counter step: not in the type, but the text panel writes it.
    degreesOffset: optNum(-100000, 100000),
  },
  barcode: {
    ...COMMON,
    height: num(0, 2000),
    ...contentFields(),
    content: str(DEFAULT_BARCODE_STATE.content),
    encodeMode: str(DEFAULT_BARCODE_STATE.encodeMode, 40),
    textFlag: oneOf(['Hide', 'Top', 'Bottom'], DEFAULT_BARCODE_STATE.textFlag),
    ...fontFields(DEFAULT_BARCODE_STATE),
    ...inkFields(DEFAULT_BARCODE_STATE),
  },
  qrcode: {
    ...COMMON,
    height: num(0, 2000),
    ...contentFields(),
    content: str(DEFAULT_QRCODE_STATE.content),
    encodeMode: oneOf(['QRCode', 'PDF417', 'DataMatrix'], DEFAULT_QRCODE_STATE.encodeMode),
    errorLevel: oneOf(['L', 'M', 'Q', 'H'], DEFAULT_QRCODE_STATE.errorLevel),
    zoneSize: oneOf(['0', '1', '2', '4'], DEFAULT_QRCODE_STATE.zoneSize),
    codeShape: oneOf(['Auto', 'Square', 'Rectangle'], DEFAULT_QRCODE_STATE.codeShape),
    degreesOffset: num(-100000, 100000, DEFAULT_QRCODE_STATE.degreesOffset),
    ...inkFields(DEFAULT_QRCODE_STATE),
  },
  line: {
    ...COMMON,
    height: num(0, 2000),
    lineStyle: oneOf(['solid', 'dashed', 'slash', 'backslash'], DEFAULT_LINE_STATE.lineStyle),
    virtualInterval: num(0, 100, DEFAULT_LINE_STATE.virtualInterval),
    ...inkFields(DEFAULT_LINE_STATE, false),
  },
  shape: {
    ...COMMON,
    height: num(0, 2000),
    figureShape: oneOf(['rectangle', 'roundedRectangle', 'oval', 'circle'], DEFAULT_SHAPE_STATE.figureShape),
    fill: bool(DEFAULT_SHAPE_STATE.fill),
    fillColor: optStr(40),
    lineWidth: num(0, 100, DEFAULT_SHAPE_STATE.lineWidth),
    roundRadius: num(0, 1000, DEFAULT_SHAPE_STATE.roundRadius),
    ...inkFields(DEFAULT_SHAPE_STATE, false),
  },
  table: {
    ...COMMON,
    height: num(0, 2000),
    lineWidth: num(0, 100, 0.75),
    rowCount: int(1, LIMITS.tableSide),
    columnCount: int(1, LIMITS.tableSide),
    ...inkFields({}, false),
  },
  time: {
    ...COMMON,
    height: optNum(0, 2000),
    offsetDay: int(-100000, 100000, 0),
    offsetHour: int(-100000, 100000, 0),
    offsetMinute: int(-100000, 100000, 0),
    offsetSecond: int(-100000, 100000, 0),
    ...fontFields(DEFAULT_TIME_STATE),
    ...inkFields(DEFAULT_TIME_STATE),
  },
  arctext: {
    ...COMMON,
    height: num(0, 2000),
    ...contentFields(),
    degreesOffset: num(-100000, 100000, DEFAULT_ARCTEXT_STATE.degreesOffset),
    text: str(DEFAULT_ARCTEXT_STATE.text),
    lineWidth: num(0, 100, DEFAULT_ARCTEXT_STATE.lineWidth),
    ...fontFields(DEFAULT_ARCTEXT_STATE, false),
    ...inkFields(DEFAULT_ARCTEXT_STATE),
  },
  degrees: {
    ...COMMON,
    height: optNum(0, 2000),
    contentType: oneOf(CONTENT_TYPES, DEFAULT_DEGREES_STATE.contentType),
    columnNameContent: str('', 200),
    degreesOffset: num(-100000, 100000, DEFAULT_DEGREES_STATE.degreesOffset),
    content: str(DEFAULT_DEGREES_STATE.content),
    ...flowFields(),
    autoTextHeight: bool(true),
    ...fontFields(DEFAULT_DEGREES_STATE),
    ...inkFields(DEFAULT_DEGREES_STATE),
  },
  image: {
    ...COMMON,
    height: num(0, 2000),
    antiColor: bool(false),
    flipH: optBool(),
    flipV: optBool(),
    contentFit: optOneOf(['fill', 'contain', 'cover']),
    ...imageColorFields(),
    tile: optBool(),
    contentType: optOneOf(['Local Image', 'Data Source']),
    columnNameContent: optStr(200),
    aspectRatioLocked: optBool(),
    originalAspect: optNum(0, 10000),
    fitLabelSource: optBool(),
    imageMode: optOneOf(['solid', 'floyd', 'atkinson', 'ordered']),
    threshold: optNum(1, 254),
    brightness: optNum(-100, 100),
    contrast: optNum(-100, 100),
    invert: optBool(),
  },
  clipart: {
    ...COMMON,
    height: num(0, 2000),
    symbol: optStr(200),
    glyph: optStr(200),
    tile: optBool(),
    ...imageColorFields(),
    strokeScale: optNum(0.5, 3),
    ...inkFields({}, false),
  },
  border: {
    ...COMMON,
    height: num(0, 2000),
    lineWidth: num(0, 100),
    geometryVersion: { k: 'num', min: 1, max: 1, opt: true, int: true },
    edgeGapMm: optNum(0, 100),
    ...inkFields({}, false),
  },
  signature: {
    ...COMMON,
    height: num(0, 2000),
    ...imageColorFields(),
    ...inkFields({}, false),
  },
};

export const KNOWN_ELEMENT_TYPES = Object.keys(ELEMENT_SPECS);

const SERIAL_KINDS = ['number', 'decimal', 'letters', 'alnum', 'hex', 'custom'] as const;

const CELL_SPEC: Record<string, Spec> = (() => {
  const d = createDefaultTableCell();
  return {
    text: str(d.text),
    ...fontFields(d),
    ...contentFields(),
    ...flowFields(),
    antiColor: bool(false),
    drawingColorIndex: int(0, 99, 0),
    degreesOffset: optNum(-100000, 100000),
  };
})();

// ───────────────────────────── context ─────────────────────────────

export type MissingKind =
  | 'element-type'
  | 'element-invalid'
  | 'image'
  | 'clipart'
  | 'user-clipart'
  | 'border-style'
  | 'font'
  | 'outline'
  | 'background'
  | 'reference-image';

export type MissingItem = { kind: MissingKind; name: string; detail?: string };

export type SchemaContext = {
  /** Asset paths present in the package, with what they are. */
  assets: Map<string, { kind: 'image' | 'svg' }>;
  /** User clipart ids declared in the manifest (their files are in the package). */
  userClipartIds: ReadonlySet<string>;
  isKnownClipartId: (id: string) => boolean;
  isKnownBorderStyle: (id: string) => boolean;
  /** Fresh element ids. */
  newId: () => string;
};

export type ValidatedDocument = {
  document: Omit<LabelDocument, 'id' | 'createdAt' | 'updatedAt' | 'groupId'>;
  missing: MissingItem[];
  warnings: string[];
  /** Element count by type for the top-level `elements` list. */
  counts: Record<string, number>;
  fontNames: string[];
  /** Asset paths the document actually refers to. */
  usedAssets: Set<string>;
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

// ───────────────────────────── JSON safety ─────────────────────────────

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Throws on prototype-pollution keys, depth over the limit, oversized strings, non-finite numbers. */
export function assertSafeJson(value: unknown, depth = 0, svgOk = false): void {
  if (depth > LIMITS.jsonDepth) throw new ShareFormatError('This label is nested too deeply.', 'depth');
  if (typeof value === 'string') {
    if (value.length > (svgOk ? LIMITS.svgBytes : LIMITS.stringChars)) {
      throw new ShareFormatError('This label contains a text that is too long.', 'string-too-long');
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ShareFormatError('This label contains an invalid number.', 'bad-number');
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, depth + 1);
    return;
  }
  if (isObj(value)) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new ShareFormatError('This label contains a forbidden key.', 'forbidden-key');
      if (key.length > 200) throw new ShareFormatError('This label contains a key that is too long.', 'key-too-long');
      assertSafeJson(value[key], depth + 1, key === 'xml');
    }
  }
}

// ───────────────────────────── field validation ─────────────────────────────

class Collector {
  readonly missing: MissingItem[] = [];
  readonly warnings: string[] = [];
  readonly usedAssets = new Set<string>();
  readonly fontNames = new Set<string>();
  elementCount = 0;
  constructor(readonly ctx: SchemaContext) {}
  warn(message: string) {
    if (this.warnings.length < 200) this.warnings.push(message);
  }
  miss(item: MissingItem) {
    if (!this.missing.some((m) => m.kind === item.kind && m.name === item.name)) this.missing.push(item);
  }
}

function applySpec(value: unknown, spec: Spec): { ok: true; value: unknown } | { ok: false } {
  switch (spec.k) {
    case 'num': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false };
      let n = spec.wrap360 ? ((value % 360) + 360) % 360 : Math.min(spec.max, Math.max(spec.min, value));
      if (spec.int) n = Math.round(n);
      return { ok: true, value: n };
    }
    case 'bool':
      return typeof value === 'boolean' ? { ok: true, value } : { ok: false };
    case 'str':
      return typeof value === 'string' && value.length <= spec.max ? { ok: true, value } : { ok: false };
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value) ? { ok: true, value } : { ok: false };
  }
}

function sanitizeText(value: string): string {
   
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

/** Validate `raw` against `spec`. Unknown keys are copied through (JSON safety already checked). */
function validateFields(raw: Json, specs: Record<string, Spec>, where: string, c: Collector): Json | null {
  const out: Json = {};
  for (const [key, spec] of Object.entries(specs)) {
    if (!(key in raw) || raw[key] === undefined) {
      if (spec.opt) continue;
      if ('def' in spec && spec.def !== undefined) {
        out[key] = spec.def;
        continue;
      }
      c.warn(`${where}: missing ${key}`);
      return null;
    }
    const res = applySpec(raw[key], spec);
    if (res.ok) {
      out[key] = typeof res.value === 'string' && spec.k === 'str' ? sanitizeText(res.value) : res.value;
      continue;
    }
    if (spec.opt) {
      c.warn(`${where}: dropped invalid ${key}`);
      continue;
    }
    if ('def' in spec && spec.def !== undefined) {
      c.warn(`${where}: ${key} was invalid, default used`);
      out[key] = spec.def;
      continue;
    }
    c.warn(`${where}: invalid ${key}`);
    return null;
  }
  let extras = 0;
  for (const key of Object.keys(raw)) {
    if (key in specs || key in out) continue;
    if (FORBIDDEN_KEYS.has(key) || extras >= 50 || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) continue;
    out[key] = raw[key];
    extras += 1;
  }
  return out;
}

// ───────────────────────────── serial ─────────────────────────────

const SERIAL_SPEC: Record<string, Spec> = {
  id: { k: 'str', max: LIMITS.idChars },
  kind: oneOf(SERIAL_KINDS),
  start: str(undefined, 200),
  step: str(undefined, 200),
  prefix: optStr(200),
  suffix: optStr(200),
  minWidth: optInt(0, 200),
  padChar: optStr(4),
  decimals: optInt(0, 8),
  rounding: optOneOf(['half-up', 'down']),
  letterCase: optOneOf(['upper', 'lower']),
  excluded: optStr(64),
  alphabet: optStr(256),
  repeatEach: optInt(1, 1_000_000),
  overflow: optOneOf(['extend', 'wrap', 'stop']),
  checkDigit: optOneOf(['none', 'mod10', 'symbology']),
  linkTo: optStr(LIMITS.idChars),
};

function validateSerial(raw: unknown, where: string, c: Collector): Json | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw) || raw.v !== 1) {
    c.warn(`${where}: serial settings dropped (unsupported)`);
    return undefined;
  }
  const out = validateFields(raw, { ...SERIAL_SPEC, v: { k: 'num', min: 1, max: 1, int: true } }, `${where}.serial`, c);
  if (!out) {
    c.warn(`${where}: serial settings dropped (invalid)`);
    return undefined;
  }
  return out;
}

// ───────────────────────────── elements ─────────────────────────────

function sanitizeNested(el: Json, type: string, where: string, c: Collector): Json | null {
  if (type === 'table') {
    const rows = el.rowCount as number;
    const cols = el.columnCount as number;
    const fixLen = (v: unknown, n: number, make: () => number[]): number[] => {
      if (Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 2000)) {
        return v as number[];
      }
      c.warn(`${where}: table sizes were invalid, equal split used`);
      return make();
    };
    el.rowHeights = fixLen(el.rowHeights, rows, () => divideTableRowHeights(el.height as number, rows));
    el.columnWidths = fixLen(el.columnWidths, cols, () => divideTableColumnWidths(el.width as number, cols));
    if (el.cells !== undefined) {
      if (!Array.isArray(el.cells) || el.cells.length > LIMITS.tableSide) {
        c.warn(`${where}: table cells dropped`);
        delete el.cells;
      } else {
        const cleaned: Json[][] = [];
        for (let r = 0; r < Math.min(el.cells.length, rows); r += 1) {
          const rowRaw = el.cells[r];
          const row: Json[] = [];
          if (Array.isArray(rowRaw)) {
            for (let k = 0; k < Math.min(rowRaw.length, cols); k += 1) {
              const cellRaw = rowRaw[k];
              const cell = isObj(cellRaw) ? validateFields(cellRaw, CELL_SPEC, `${where}.cell`, c) : null;
              if (cell) {
                const serial = validateSerial((cellRaw as Json).serial, `${where}.cell`, c);
                if (serial) cell.serial = serial;
                else delete cell.serial;
                if (typeof cell.fontFamily === 'string' && cell.fontFamily) c.fontNames.add(cell.fontFamily);
                row.push(cell);
              } else {
                row.push(createDefaultTableCell() as unknown as Json);
              }
            }
          }
          cleaned.push(row);
        }
        el.cells = resizeTableCells(cleaned as never, rows, cols);
      }
    }
    return el;
  }
  if (type === 'signature') {
    const strokes = (el as Json).strokes;
    if (!Array.isArray(strokes) || strokes.length > LIMITS.signatureStrokes) {
      c.warn(`${where}: signature strokes invalid`);
      return null;
    }
    let points = 0;
    const cleaned: Json[] = [];
    for (const s of strokes) {
      if (!isObj(s) || !Array.isArray(s.points) || typeof s.strokeWidth !== 'number' || !Number.isFinite(s.strokeWidth)) {
        c.warn(`${where}: a signature stroke was dropped`);
        continue;
      }
      points += s.points.length;
      if (points > LIMITS.signaturePoints) {
        c.warn(`${where}: too many signature points`);
        return null;
      }
      const pts: Json[] = [];
      for (const p of s.points) {
        if (isObj(p) && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          pts.push({ x: Math.min(2, Math.max(-1, p.x)), y: Math.min(2, Math.max(-1, p.y)) });
        }
      }
      cleaned.push({ points: pts, strokeWidth: Math.min(1, Math.max(0, s.strokeWidth)) });
    }
    el.strokes = cleaned;
    return el;
  }
  return el;
}

function validateElement(raw: unknown, where: string, c: Collector, idMap: Map<string, string>): LabelElement | null {
  if (!isObj(raw)) {
    c.warn(`${where}: not an object`);
    return null;
  }
  c.elementCount += 1;
  if (c.elementCount > LIMITS.elements) {
    throw new ShareFormatError('This label has too many elements.', 'too-many-elements');
  }
  const type = typeof raw.type === 'string' ? raw.type : '';
  const specs = ELEMENT_SPECS[type];
  if (!specs) {
    c.miss({ kind: 'element-type', name: type ? String(type).slice(0, 60) : 'unknown' });
    return null;
  }
  const fields = validateFields(raw, specs, `${where} (${type})`, c);
  if (!fields) {
    c.miss({ kind: 'element-invalid', name: type, detail: 'missing or invalid required fields' });
    return null;
  }
  const el = sanitizeNested(fields, type, `${where} (${type})`, c);
  if (!el) {
    c.miss({ kind: 'element-invalid', name: type });
    return null;
  }

  // Serial config (text-like elements only).
  if (['text', 'barcode', 'qrcode', 'arctext', 'degrees'].includes(type)) {
    const serial = validateSerial(raw.serial, `${where} (${type})`, c);
    if (serial) el.serial = serial;
    else delete el.serial;
  }

  // Ids: always fresh, but one old id maps to one new id across the whole document.
  const oldId = typeof raw.id === 'string' && raw.id.length <= LIMITS.idChars ? raw.id : null;
  let id = oldId ? idMap.get(oldId) : undefined;
  if (!id) {
    id = c.ctx.newId();
    if (oldId) idMap.set(oldId, id);
  }
  el.id = id;
  el.type = type;

  if (typeof el.fontFamily === 'string' && el.fontFamily) c.fontNames.add(el.fontFamily);

  // File references.
  if (type === 'image') {
    const ref = typeof raw.printUri === 'string' ? raw.printUri : '';
    const asset = c.ctx.assets.get(ref);
    delete el.uri;
    delete el.printUri;
    if (asset?.kind === 'image') {
      el.printUri = ref;
      el.uri = ref; // rewritten to the rebuilt working copy when the label is saved
      c.usedAssets.add(ref);
    } else if (el.contentType === 'Data Source') {
      el.uri = '';
    } else {
      c.miss({ kind: 'image', name: ref ? ref.slice(-40) : 'image file', detail: 'the picture is not in the file' });
      return null;
    }
    delete el.workingWidthPx;
    delete el.workingHeightPx;
  }
  if (type === 'clipart') {
    const id2 = typeof raw.clipartId === 'string' && raw.clipartId.length > 0 && raw.clipartId.length <= LIMITS.idChars ? raw.clipartId : null;
    if (!id2) {
      c.miss({ kind: 'element-invalid', name: 'clipart', detail: 'no clipart id' });
      return null;
    }
    el.clipartId = id2;
    if (c.ctx.userClipartIds.has(id2)) {
      // checked against the manifest list by the importer; usage recorded there
    } else if (!c.ctx.isKnownClipartId(id2)) {
      c.miss({ kind: 'clipart', name: id2.slice(0, 60), detail: 'not in this version of the app' });
    }
  }
  if (type === 'border') {
    const style = typeof raw.borderStyle === 'string' && raw.borderStyle.length <= 60 ? raw.borderStyle : null;
    if (!style) {
      c.miss({ kind: 'element-invalid', name: 'border', detail: 'no border style' });
      return null;
    }
    el.borderStyle = style;
    if (!c.ctx.isKnownBorderStyle(style)) {
      c.miss({ kind: 'border-style', name: style, detail: 'drawn with the default border' });
    }
  }
  return el as unknown as LabelElement;
}

function validateElementList(raw: unknown, where: string, c: Collector, idMap: Map<string, string>): LabelElement[] {
  if (!Array.isArray(raw)) {
    c.warn(`${where}: not a list`);
    return [];
  }
  const out: LabelElement[] = [];
  raw.forEach((item, i) => {
    const el = validateElement(item, `${where}[${i}]`, c, idMap);
    if (el) out.push(el);
  });
  return out;
}

// ───────────────────────────── document ─────────────────────────────

const ORIENTATIONS = [0, 90, 180, 270];
const MEDIA_SHAPES = ['rectangle', 'roundedRectangle', 'circle', 'ellipse', 'diecut'];
const HEX = /^#[0-9a-fA-F]{3,8}$/;

function validateMediaGeometry(raw: unknown, c: Collector): Json | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw) || typeof raw.type !== 'string') {
    c.warn('mediaGeometry dropped');
    return undefined;
  }
  const base = (extra: Record<string, Spec>) =>
    validateFields(raw, { type: oneOf(['rectangle', 'rounded_rectangle', 'circle', 'tag', 'jewelry', 'rat_tail']), ...extra }, 'mediaGeometry', c);
  const mm = (max = 2000) => num(0, max);
  const out =
    raw.type === 'rat_tail'
      ? base({
          bodyWidthMm: mm(), bodyHeightMm: mm(), tailLengthMm: mm(), tailHeightMm: mm(),
          tailPosition: oneOf(['right', 'left', 'bottom', 'top']),
          cornerRadiusMm: optNum(0, 1000),
        })
      : raw.type === 'rounded_rectangle'
        ? base({ radiusMm: optNum(0, 1000) })
        : base({});
  if (!out) c.warn('mediaGeometry dropped');
  return out ?? undefined;
}

function validateUps(raw: unknown, c: Collector, idMap: Map<string, string>): { ups?: Json; elementsIdMap?: boolean } {
  if (raw === undefined) return {};
  if (!isObj(raw)) {
    c.warn('ups dropped');
    return {};
  }
  const head = validateFields(
    raw,
    {
      columns: int(2, LIMITS.upsColumns),
      columnSpacingMm: num(-50, 500, 0),
      batchEdit: bool(false),
      activeIndex: int(0, LIMITS.upsColumns - 1, 0),
    },
    'ups',
    c,
  );
  if (!head) {
    c.warn('ups dropped');
    return {};
  }
  const columns = head.columns as number;
  head.activeIndex = Math.min(head.activeIndex as number, columns - 1);
  const rawPanels = Array.isArray(raw.panels) ? raw.panels : [];
  const panels: LabelElement[][] = [];
  for (let i = 0; i < columns; i += 1) {
    panels.push(validateElementList(rawPanels[i] ?? [], `ups.panels[${i}]`, c, idMap));
  }
  if (rawPanels.length !== columns) c.warn('ups panels were padded or trimmed to match columns');
  head.panels = panels;
  return { ups: head };
}

function validateGeometryMap(raw: unknown): Record<string, { left: number; top: number; width: number; height: number }> {
  const out: Record<string, { left: number; top: number; width: number; height: number }> = {};
  if (!isObj(raw)) return out;
  for (const [slotId, g] of Object.entries(raw)) {
    if (!isObj(g) || FORBIDDEN_KEYS.has(slotId)) continue;
    const n = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);
    const left = n(g.left, -1000, 1000), top = n(g.top, -1000, 1000), width = n(g.width, 0, 2000), height = n(g.height, 0, 2000);
    if (left !== null && top !== null && width !== null && height !== null) out[slotId] = { left, top, width, height };
  }
  return out;
}

/** Bulk structure only. Rows, edited cells, per-row copies and the data file id are never kept. */
function validateBulk(raw: unknown, c: Collector, idMap: Map<string, string>): Json | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw) || !Array.isArray(raw.slots) || !isObj(raw.slotTemplates)) {
    c.warn('bulk dropped');
    return undefined;
  }
  const head = validateFields(
    raw,
    {
      sheetIndex: int(0, 100, 0),
      rowCount: int(0, 1_000_000, 0),
      activeRowIndex: int(0, 1_000_000, 0),
      barcodeEncodeMode: str(DEFAULT_BARCODE_STATE.encodeMode, 40),
      qrErrorLevel: oneOf(['L', 'M', 'Q', 'H'], 'L'),
      displayHead: optBool(),
      copiesColumnIndex: { k: 'num', min: 0, max: 1000, opt: true, int: true },
    },
    'bulk',
    c,
  );
  if (!head) return undefined;
  head.activeRowIndex = 0;
  const slots: Json[] = [];
  const templates: Record<string, LabelElement> = {};
  for (const s of raw.slots.slice(0, LIMITS.bulkSlots)) {
    if (!isObj(s) || typeof s.id !== 'string' || !/^col:\d{1,4}$/.test(s.id)) continue;
    const slot = validateFields(
      s,
      { id: str(undefined, 20), columnIndex: int(0, 1000), columnName: str('', 200), kind: oneOf(['text', 'barcode', 'qrcode']) },
      'bulk.slot',
      c,
    );
    const template = (raw.slotTemplates as Json)[s.id];
    const el = slot ? validateElement(template, `bulk.slotTemplates[${s.id}]`, c, idMap) : null;
    if (slot && el) {
      slots.push(slot);
      templates[s.id] = el;
    } else {
      c.warn(`bulk slot ${s.id} dropped`);
    }
  }
  head.slots = slots;
  head.slotTemplates = templates;
  const shared = validateGeometryMap(raw.sharedGeometry);
  head.sharedGeometry = Object.fromEntries(Object.entries(shared).filter(([k]) => k in templates));
  const rows: Record<string, Record<string, unknown>> = {};
  if (isObj(raw.rowGeometryOverrides)) {
    for (const [row, map] of Object.entries(raw.rowGeometryOverrides)) {
      if (FORBIDDEN_KEYS.has(row) || !/^\d{1,7}$/.test(row)) continue;
      const g = validateGeometryMap(map);
      if (Object.keys(g).length) rows[row] = g;
    }
  }
  head.rowGeometryOverrides = rows;
  head.rowContentOverrides = {};
  return head;
}

const SETTINGS_IN: Record<string, Spec> = {
  mirrorMode: oneOf(['Close', 'Reverse', 'Syntropy']),
  flagLabel: bool(),
  mirrorRowsCount: int(2, 4),
  mirrorSpacingMm: num(-50, 500),
  mirrorRowNumber: int(1, 4),
  antiColor: bool(),
  defaultDrawingColorIndex: int(0, 99),
};

/** Only the design-level settings travel. Everything else is dropped, never trusted. */
function validateSettings(raw: unknown, c: Collector): Json | undefined {
  if (!isObj(raw)) return undefined;
  const out: Json = {};
  for (const [key, spec] of Object.entries(SETTINGS_IN)) {
    if (!(key in raw)) continue;
    const res = applySpec(raw[key], spec);
    if (res.ok) out[key] = res.value;
    else c.warn(`settings.${key} dropped`);
  }
  return Object.keys(out).length ? out : undefined;
}

export function validateDocument(raw: unknown, ctx: SchemaContext): ValidatedDocument {
  if (!isObj(raw)) throw new ShareFormatError("This file isn't a valid Sez Print label.", 'bad-document');
  assertSafeJson(raw);
  const c = new Collector(ctx);
  const idMap = new Map<string, string>();

  const width = raw.widthMm;
  const height = raw.heightMm;
  if (typeof width !== 'number' || typeof height !== 'number' || !(width >= 1 && width <= 2000) || !(height >= 1 && height <= 2000)) {
    throw new ShareFormatError('This label has an invalid size.', 'bad-size');
  }
  const name = typeof raw.name === 'string' ? sanitizeText(raw.name).trim().slice(0, LIMITS.nameChars) : '';

  const doc: Json = {};
  // Unknown top-level keys are carried through (except the local identity fields).
  let extras = 0;
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEYS.has(key) || extras >= 50 || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) continue;
    if (['id', 'groupId', 'createdAt', 'updatedAt', 'schemaVersion', 'settings'].includes(key)) continue;
    doc[key] = raw[key];
    extras += 1;
  }

  doc.name = name || 'Imported label';
  doc.widthMm = width;
  doc.heightMm = height;
  doc.orientation = ORIENTATIONS.includes(raw.orientation as number) ? raw.orientation : 0;
  doc.paperType = readPaperType(raw.paperType);
  delete doc.mediaShape;
  if (raw.mediaShape !== undefined) {
    if (typeof raw.mediaShape === 'string' && MEDIA_SHAPES.includes(raw.mediaShape)) doc.mediaShape = raw.mediaShape;
    else c.warn('mediaShape dropped');
  }
  delete doc.mediaGeometry;
  const geometry = validateMediaGeometry(raw.mediaGeometry, c);
  if (geometry) doc.mediaGeometry = geometry;

  // Background.
  delete doc.background;
  if (isObj(raw.background)) {
    const bg = raw.background;
    if (bg.type === 'none') doc.background = { type: 'none' };
    else if (bg.type === 'color' && typeof bg.color === 'string' && HEX.test(bg.color)) {
      doc.background = { type: 'color', color: bg.color };
    } else if (bg.type === 'image' && typeof bg.uri === 'string' && ctx.assets.get(bg.uri)?.kind === 'image') {
      doc.background = { type: 'image', uri: bg.uri };
      c.usedAssets.add(bg.uri);
    } else {
      c.miss({ kind: 'background', name: 'background image' });
    }
  }

  // Template identity and outline.
  delete doc.templatePreviewType;
  delete doc.templateCategory;
  if (typeof raw.templatePreviewType === 'string' && raw.templatePreviewType.length <= 120) {
    doc.templatePreviewType = raw.templatePreviewType;
  }
  if (typeof raw.templateCategory === 'string' && raw.templateCategory.length <= 120) {
    doc.templateCategory = raw.templateCategory;
  }
  delete doc.templateSvg;
  if (raw.templateSvg !== undefined) {
    const xml = isObj(raw.templateSvg) && typeof raw.templateSvg.xml === 'string' ? sanitizeSvgStrict(raw.templateSvg.xml) : null;
    if (xml) doc.templateSvg = { xml };
    else c.miss({ kind: 'outline', name: 'label outline', detail: 'the template shape was not safe to keep' });
  }

  // Elements (the top-level list is validated first so shared ids line up with ups panels).
  doc.elements = validateElementList(raw.elements, 'elements', c, idMap);
  const counts: Record<string, number> = {};
  for (const el of doc.elements as LabelElement[]) counts[el.type] = (counts[el.type] ?? 0) + 1;

  delete doc.ups;
  const { ups } = validateUps(raw.ups, c, idMap);
  if (ups) doc.ups = ups;

  delete doc.upsTile;
  if (isObj(raw.upsTile)) {
    const tile = validateFields(
      raw.upsTile,
      {
        shape: oneOf(['circle', 'ellipse']),
        columns: int(1, 50),
        gapMm: num(-50, 500),
        cellWidthMm: num(0.1, 2000),
        cellHeightMm: num(0.1, 2000),
        originXMm: num(-1000, 1000),
        originYMm: num(-1000, 1000),
      },
      'upsTile',
      c,
    );
    if (tile) doc.upsTile = tile;
  }

  delete doc.serialBatch;
  if (isObj(raw.serialBatch) && raw.serialBatch.v === 1) {
    const batch = validateFields(raw.serialBatch, { v: int(1, 1), count: int(1, LIMITS.serialBatch) }, 'serialBatch', c);
    if (batch) doc.serialBatch = batch;
  }

  delete doc.bulk;
  const bulk = validateBulk(raw.bulk, c, idMap);
  if (bulk) doc.bulk = bulk;

  delete doc.referenceImage;
  if (isObj(raw.referenceImage)) {
    const ref = raw.referenceImage;
    const path = typeof ref.fileName === 'string' ? ref.fileName : '';
    if (ctx.assets.get(path)?.kind === 'image') {
      const r = validateFields(
        ref,
        {
          widthPx: int(1, LIMITS.imageEdgePx),
          heightPx: int(1, LIMITS.imageEdgePx),
          rotation: optNum(-360, 360),
          needPrinting: optBool(),
        },
        'referenceImage',
        c,
      );
      if (r) {
        r.fileName = path;
        doc.referenceImage = r;
        c.usedAssets.add(path);
      }
    } else {
      c.miss({ kind: 'reference-image', name: 'guide photo' });
    }
  }

  const settings = validateSettings(raw.settings, c);
  if (settings) doc.settings = settings;

  return {
    document: doc as unknown as ValidatedDocument['document'],
    missing: c.missing,
    warnings: c.warnings,
    counts,
    fontNames: [...c.fontNames],
    usedAssets: c.usedAssets,
  };
}

/** Number of nested element lists of a document, for walkers (export and commit). */
export function forEachElement(
  doc: { elements: LabelElement[]; ups?: { panels: LabelElement[][] }; bulk?: { slotTemplates: Record<string, LabelElement> } },
  fn: (el: LabelElement) => void,
): void {
  for (const el of doc.elements) fn(el);
  for (const panel of doc.ups?.panels ?? []) for (const el of panel) fn(el);
  for (const el of Object.values(doc.bulk?.slotTemplates ?? {})) fn(el);
}

