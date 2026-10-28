/**
 * Builds the label a "Serial Labels" run opens on the canvas: a serial text, optionally a barcode
 * and/or a QR code that all show the same serial value, laid out for the label size.
 *
 * Pure TypeScript (no React Native), so it runs in node tests. The user can still move and resize
 * everything in the editor; this only picks a sensible first arrangement.
 */

import { DEFAULT_BARCODE_STATE, DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '@/components/editor/types';
import {
  createLabelDocument,
  generateId,
  mmToPt,
  textBlockHeightMm,
  type LabelDocument,
  type LabelElement,
  type LabelOrientation,
  type PaperType,
} from '@/lib/label-document';
import type { AutoWrapping } from '@/components/editor/types';

import { firstAndLast, longestValue, validateConfig } from './engine';
import { defaultSerialConfig, newSerialFieldId } from './legacy';
import { resolveDocumentForIndex, serialMaps, collectSerialFields } from './resolve-document';
import { storedValuePatch } from './stored';
import { barcodeSerialIssues, qrSerialIssues } from './symbology-validate';
import { DEFAULT_SERIAL_COUNT, MAX_SERIAL_BATCH, type SerialConfig, type SerialIssue } from './types';

export type SerialBarcodeType = 'CODE-128' | 'CODE-39' | 'EAN-13' | 'UPC-A';

export const SERIAL_BARCODE_TYPES: { id: SerialBarcodeType; label: string; hint: string }[] = [
  { id: 'CODE-128', label: 'Code 128', hint: 'Best all-rounder. Letters and numbers.' },
  { id: 'CODE-39', label: 'Code 39', hint: 'Older style. Capital letters and numbers.' },
  { id: 'EAN-13', label: 'EAN-13', hint: 'Retail. 12 digits; the check digit is added for you.' },
  { id: 'UPC-A', label: 'UPC-A', hint: 'Retail (US). 11 digits; the check digit is added for you.' },
];

export interface SerialInfoOptions {
  /** The first label exactly as typed: "Desk1", "SN-001", "Bin 42B". Its last number counts up. */
  sample: string;
  /** How many labels. */
  count: number;
  /** How much the number goes up each label. */
  step: number;
  /** Fixed digit count (leading zeros). Undefined: copy the zeros typed in `sample`. */
  digits?: number;
  showText: boolean;
  showBarcode: boolean;
  showQr: boolean;
  barcodeType: SerialBarcodeType;
}

export const DEFAULT_SERIAL_INFO: SerialInfoOptions = {
  sample: 'Desk1',
  count: DEFAULT_SERIAL_COUNT,
  step: 1,
  showText: true,
  showBarcode: false,
  showQr: false,
  barcodeType: 'CODE-128',
};

/** The serial config the options describe (not yet linked to any element). */
export function serialConfigFromOptions(o: SerialInfoOptions, id?: string): SerialConfig {
  const base = defaultSerialConfig(o.sample);
  const typedZeros = base.start.length > 1 && base.start.startsWith('0') ? base.start.length : undefined;
  const minWidth = o.digits && o.digits > 0 ? Math.min(40, Math.floor(o.digits)) : typedZeros;
  const checkDigit = o.barcodeType === 'EAN-13' || o.barcodeType === 'UPC-A' ? 'symbology' : 'none';
  return {
    ...base,
    id: id ?? base.id,
    step: String(Math.floor(o.step) || 1),
    ...(minWidth ? { minWidth } : {}),
    ...(o.showBarcode && checkDigit === 'symbology' ? { checkDigit } : {}),
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SerialLayout {
  text?: Rect;
  barcode?: Rect;
  qr?: Rect;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Where the text, barcode and QR code go on a label of this size. */
export function layoutSerialElements(
  widthMm: number,
  heightMm: number,
  show: { text: boolean; barcode: boolean; qr: boolean },
): SerialLayout {
  const pad = Math.max(1, Math.min(2, Math.min(widthMm, heightMm) * 0.08));
  const inner: Rect = { x: pad, y: pad, w: Math.max(2, widthMm - pad * 2), h: Math.max(2, heightMm - pad * 2) };
  const wide = widthMm >= heightMm * 1.35;
  const out: SerialLayout = {};
  const others = show.text || show.barcode;
  let region: Rect = inner;

  if (show.qr) {
    if (wide || !others) {
      // QR on the left, full height; the rest shares the space on its right.
      const size = Math.min(inner.h, others ? inner.w * 0.38 : inner.w);
      out.qr = { x: pad, y: inner.y + (inner.h - size) / 2, w: size, h: size };
      if (others) region = { x: pad * 2 + size, y: inner.y, w: Math.max(2, widthMm - pad * 3 - size), h: inner.h };
    } else {
      // Tall label: QR sits at the bottom, the rest stacks above it.
      const size = Math.min(inner.w, inner.h * 0.5);
      out.qr = { x: inner.x + (inner.w - size) / 2, y: heightMm - pad - size, w: size, h: size };
      region = { x: inner.x, y: inner.y, w: inner.w, h: Math.max(2, inner.h - size - pad * 0.5) };
    }
  }

  if (show.text && show.barcode) {
    const gap = pad * 0.5;
    const textH = Math.min(region.h * 0.4, Math.max(textBlockHeightMm(6, 1), region.h * 0.34));
    out.text = { x: region.x, y: region.y, w: region.w, h: textH };
    out.barcode = { x: region.x, y: region.y + textH + gap, w: region.w, h: Math.max(2, region.h - textH - gap) };
  } else if (show.text) {
    out.text = region;
  } else if (show.barcode) {
    out.barcode = region;
  }
  return out;
}

export interface BuiltSerialLabel {
  doc: LabelDocument;
  /** Problems with the series or its codes. Any `error` means it cannot print as set. */
  issues: SerialIssue[];
  /** First and last label text, for the summary line. Null when the series cannot be produced. */
  range: { first: string; last: string } | null;
}

export function buildSerialLabelDocument(p: {
  name: string;
  widthMm: number;
  heightMm: number;
  orientation?: LabelOrientation;
  paperType?: PaperType;
  autoWrap?: AutoWrapping;
  circle?: boolean;
  options: SerialInfoOptions;
}): BuiltSerialLabel {
  const o = p.options;
  const count = Math.max(1, Math.min(MAX_SERIAL_BATCH, Math.floor(o.count) || 1));
  // At least one thing must be on the label.
  const show = {
    text: o.showText || (!o.showBarcode && !o.showQr),
    barcode: o.showBarcode,
    qr: o.showQr,
  };
  const layout = layoutSerialElements(p.widthMm, p.heightMm, show);
  const encodeMode = o.barcodeType;

  // The barcode, else the QR code, else the text carries the real settings; the others follow it.
  const rootKind = show.barcode ? 'barcode' : show.qr ? 'qrcode' : 'text';
  const root = serialConfigFromOptions(o, newSerialFieldId());
  const follower = (): SerialConfig => ({ ...root, id: newSerialFieldId(), linkTo: root.id });
  const configFor = (kind: 'text' | 'barcode' | 'qrcode') => (kind === rootKind ? root : follower());
  const rootCtx = rootKind === 'barcode' ? { encodeMode } : undefined;

  const widest = longestValue(root, count, 0, rootCtx) ?? o.sample;
  const elements: LabelElement[] = [];

  if (show.qr && layout.qr) {
    const cfg = configFor('qrcode');
    elements.push({
      ...DEFAULT_QRCODE_STATE,
      id: generateId(),
      type: 'qrcode',
      contentType: 'Degrees',
      ...storedValuePatch(cfg, 'content'),
      left: round1(layout.qr.x),
      top: round1(layout.qr.y),
      width: round1(layout.qr.w),
      height: round1(layout.qr.h),
    } as unknown as LabelElement);
  }
  if (show.barcode && layout.barcode) {
    const cfg = configFor('barcode');
    elements.push({
      ...DEFAULT_BARCODE_STATE,
      id: generateId(),
      type: 'barcode',
      contentType: 'Degrees',
      encodeMode,
      // The serial text above already shows the number; only print it under the bars when there is none.
      textFlag: show.text ? 'Hide' : 'Bottom',
      ...storedValuePatch(cfg, 'content', { encodeMode }),
      left: round1(layout.barcode.x),
      top: round1(layout.barcode.y),
      width: round1(layout.barcode.w),
      height: round1(layout.barcode.h),
    } as unknown as LabelElement);
  }
  if (show.text && layout.text) {
    const cfg = configFor('text');
    const r = layout.text;
    // Font: as tall as the band allows, but short enough that the widest value stays on one line.
    const chars = Math.max(1, Array.from(widest).length);
    const byHeight = mmToPt(r.h / 1.45);
    const byWidth = mmToPt(r.w / (chars * 0.62));
    const minPt = Math.min(p.widthMm, p.heightMm) < 18 ? 4 : 6;
    const fontSize = Math.max(minPt, Math.min(28, Math.floor(Math.min(byHeight, byWidth) * 2) / 2));
    const block = textBlockHeightMm(fontSize, 1);
    elements.push({
      ...DEFAULT_ELEMENT_STATE,
      id: generateId(),
      type: 'text',
      text: '1',
      contentType: 'Degrees',
      ...storedValuePatch(cfg, 'text'),
      align: 'center',
      left: round1(r.x),
      top: round1(r.y + Math.max(0, (r.h - block) / 2)),
      width: round1(r.w),
      fontSize,
      autoTextHeight: true,
      autoWrapping: p.autoWrap ?? 'Word',
    } as unknown as LabelElement);
  }

  const doc = createLabelDocument({
    name: p.name,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    orientation: p.orientation,
    paperType: p.paperType,
    ...(p.circle ? { mediaShape: 'circle' as const } : {}),
    elements,
    background: { type: 'color', color: '#FFFFFF' }, // label paper colour (document data)
  });
  doc.serialBatch = { v: 1, count };

  // Anything that does not know about Serial (thumbnails, history) shows the first label.
  const first = resolveDocumentForIndex(doc, 0);
  doc.elements = doc.elements.map((el, i) => {
    const key = el.type === 'text' ? 'text' : 'content';
    const value = (first.elements[i] as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? ({ ...el, [key]: value } as LabelElement) : el;
  });

  const issues: SerialIssue[] = [...validateConfig(root, count, 0, rootCtx)];
  if (!issues.some((i) => i.severity === 'error')) {
    const fields = collectSerialFields(doc);
    const { configs, contexts } = serialMaps(fields);
    const common = { configs, contexts, count, offset: 0 };
    const bar = fields.find((f) => f.type === 'barcode');
    const qr = fields.find((f) => f.type === 'qrcode');
    if (bar && layout.barcode) {
      issues.push(...barcodeSerialIssues({ ...common, mode: encodeMode, config: bar.config, widthMm: layout.barcode.w }));
    }
    if (qr && layout.qr) {
      issues.push(...qrSerialIssues({ ...common, mode: 'QRCode', level: 'L', config: qr.config, widthMm: layout.qr.w }));
    }
  }
  return { doc, issues, range: firstAndLast(root, count, 0, rootCtx) };
}
