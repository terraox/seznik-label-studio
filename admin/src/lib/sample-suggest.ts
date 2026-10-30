/**
 * Suggested sample content for a template, from its shape, size and use case.
 * Text is mostly SEZNIK INDIA in caps; the rest is placeholder detail the admin edits.
 */
import { textHeightMm } from './sample-render';
import type { SampleElement } from './sample-layout';

export type Shape = 'round' | 'oval' | 'rect';
export type UseCase = 'brand' | 'product' | 'stock' | 'address' | 'qr';

export const USE_CASES: { id: UseCase; name: string }[] = [
  { id: 'brand', name: 'Brand' },
  { id: 'product', name: 'Product' },
  { id: 'stock', name: 'Barcode' },
  { id: 'address', name: 'Address' },
  { id: 'qr', name: 'QR' },
];

const BRAND = 'SEZNIK INDIA';
const round = (n: number) => Math.round(n * 100) / 100;

/** Round, oval or rectangular, read from the outline's drawing elements. Anything else counts as a rectangle. */
export function detectShape(svg: string, w: number, h: number): Shape {
  const circle = /<circle\b/i.test(svg) || /<ellipse\b/i.test(svg);
  const arcOnly = /<path\b[^>]*\sd="[^"]*[aAcC]/i.test(svg) && !/<path\b[^>]*\sd="[^"]*[lLhHvV]/i.test(svg) && !/<rect\b/i.test(svg);
  if (!circle && !arcOnly) return 'rect';
  return Math.abs(w - h) / Math.max(w, h) < 0.08 ? 'round' : 'oval';
}

/** A guess from the template name, so the picker starts on something sensible. */
export function guessUseCase(name: string): UseCase {
  const n = name.toLowerCase();
  if (/address|ship|parcel|courier|dispatch/.test(n)) return 'address';
  if (/qr|scan|contact/.test(n)) return 'qr';
  if (/barcode|stock|inventory|sku|asset/.test(n)) return 'stock';
  if (/price|product|jar|bottle|retail|mrp|tag/.test(n)) return 'product';
  return 'brand';
}

type Row = { kind: 'text' | 'line' | 'barcode' | 'qrcode'; text?: string; pt?: number; bold?: boolean; h?: number; w?: number; optional?: boolean };

const VARIANTS = 4;

/** Several arrangements per use case; `v` picks one, so asking again gives a different suggestion. */
function rowsFor(use: UseCase, small: boolean, v: number): Row[] {
  const name: Row = { kind: 'text', text: BRAND, pt: 1.15, bold: true };
  const rule: Row = { kind: 'line' };
  const qr = (w = 14): Row => ({ kind: 'qrcode', text: 'https://seznik.in', w });
  const bar = (h = 9, optional = false): Row => ({ kind: 'barcode', text: 'SEZ0001234', h, optional });
  const t = (text: string, pt = 0.9, bold = false, optional = false): Row => ({ kind: 'text', text, pt, bold, optional });
  const set: Record<UseCase, Row[][]> = {
    brand: [
      [{ ...name, pt: 1.6 }, rule, t('MADE IN INDIA'), t('WWW.SEZNIK.IN', 0.8, false, true)],
      [qr(16), { ...name, pt: 1.2 }, t('SCAN TO KNOW MORE', 0.75, false, true)],
      [{ ...name, pt: 1.3 }, bar(8, true), t('MADE IN INDIA', 0.8)],
      [t('MADE IN', 0.8), { ...name, pt: 1.6 }, rule, t('SEZNIK.IN', 0.85)],
    ],
    product: [
      [name, rule, t('PRODUCT NAME', 1, true, small), t('MRP ₹ 000', 1), bar(9, true)],
      [name, qr(14), t('MRP ₹ 000', 1, true)],
      [{ ...name, pt: 1 }, t('PRODUCT NAME', 1.1, true), bar(9), t('MRP ₹ 000', 0.95)],
      [t('PRODUCT NAME', 1, true), t('MRP ₹ 000', 1.5, true), rule, { ...name, pt: 0.85 }],
    ],
    stock: [
      [{ ...name, pt: 1.1 }, bar(11), t('ITEM CODE', 0.8, false, true)],
      [bar(11), t('SEZ0001234', 0.9, true), { ...name, pt: 0.9 }],
      [{ ...name, pt: 1.1 }, rule, bar(9), t('QTY 000', 0.85, false, true)],
      [{ ...name, pt: 1 }, qr(12), t('SEZ0001234', 0.85, true)],
    ],
    address: [
      [{ ...name, pt: 1.1 }, rule, t('TO: CUSTOMER NAME', 0.9, true), t('STREET, CITY - 000000', 0.85, false, small), t('PH: 00000 00000', 0.85, false, true)],
      [{ ...name, pt: 1 }, t('TO: CUSTOMER NAME', 0.9, true), qr(12), t('PH: 00000 00000', 0.8, false, true)],
      [t('FROM', 0.7), { ...name, pt: 1.1 }, rule, t('TO: CUSTOMER NAME', 0.9, true), bar(8, true)],
      [{ ...name, pt: 1 }, bar(9), t('ORDER NO 000000', 0.85, false, true)],
    ],
    qr: [
      [qr(14), { ...name, pt: 1.05 }, t('SCAN FOR DETAILS', 0.8, false, true)],
      [{ ...name, pt: 1.05 }, qr(15), t('SCAN TO ORDER', 0.9, true)],
      [qr(14), t('SCAN TO ORDER', 0.95, true), { ...name, pt: 0.8 }],
      [{ ...name, pt: 1 }, qr(12), bar(7, true)],
    ],
  };
  return set[use][v % set[use].length];
}

/**
 * Stacks the rows down the middle of the label. On round and oval labels each row is only as wide as
 * the shape is at its top and bottom edge, so nothing sits on the curve. Text shrinks, then optional rows drop, until it fits.
 */
function tryLayout(shape: Shape, use: UseCase, variant: number, w: number, h: number, newId: () => string): SampleElement[] | null {
  const margin = Math.max(1, Math.min(w, h) * 0.08);
  const curved = shape !== 'rect';
  /** Width free at the vertical span [y0, y1] (mm from the label's top). */
  const room = (y0: number, y1: number) => {
    if (!curved) return w - margin * 2;
    const ry = h / 2 - margin;
    const far = Math.max(Math.abs(y0 - h / 2), Math.abs(y1 - h / 2));
    if (far >= ry) return 0;
    return 2 * (w / 2 - margin) * Math.sqrt(1 - (far / ry) ** 2);
  };
  const span = Math.min(w, h);
  const base = Math.max(4, Math.min(14, span * 0.3));
  const small = span < 22;

  for (let round_ = 0; round_ < 14; round_++) {
    const scale = 0.92 ** round_;
    const rows = rowsFor(use, small, variant).filter((r) => !r.optional || round_ < 6 || r.kind === 'text' && round_ < 9);
    const sized = rows.map((r) => {
      if (r.kind === 'line') return { r, h: 0.5, gap: 0.6 };
      if (r.kind === 'barcode') return { r, h: Math.min(r.h ?? 9, h * 0.28) * Math.max(0.6, scale), gap: 0.6 };
      if (r.kind === 'qrcode') return { r, h: Math.min(r.w ?? 14, span * 0.45) * Math.max(0.6, scale), gap: 0.8 };
      return { r, h: 0, gap: 0.2 };
    });
    // Text heights depend on the width, which depends on the position: settle each row in turn.
    const total = (hs: number[]) => hs.reduce((a, b) => a + b, 0) + sized.reduce((a, s) => a + s.gap, 0) - (sized.at(-1)?.gap ?? 0);
    const out: SampleElement[] = [];
    let ok = true;
    // First pass at the full width to get heights, then place with the real width at each position.
    const heights = sized.map((s) => {
      if (s.r.kind !== 'text') return s.h;
      return textHeightMm(s.r.text ?? '', w - margin * 2, round(base * (s.r.pt ?? 1) * scale), !!s.r.bold);
    });
    let top = (h - total(heights)) / 2;
    sized.forEach((s, i) => {
      const height = heights[i];
      const avail = room(top, top + height);
      if (avail < 4) { ok = false; return; }
      if (s.r.kind === 'text') {
        const pt = round(base * (s.r.pt ?? 1) * scale);
        const lines = textHeightMm(s.r.text ?? '', avail, pt, !!s.r.bold);
        if (lines > height + 0.01) ok = false; // wraps to more lines here than at full width
        out.push({ id: newId(), type: 'text', left: round((w - avail) / 2), top: round(top), width: round(avail), height: round(height), text: s.r.text, fontSize: pt, bold: !!s.r.bold, align: 'center' });
      } else if (s.r.kind === 'line') {
        const lw = Math.min(avail, w * 0.6);
        out.push({ id: newId(), type: 'line', left: round((w - lw) / 2), top: round(top), width: round(lw), height: 0.5 });
      } else if (s.r.kind === 'barcode') {
        const bw = Math.min(avail, 26);
        if (bw < 14) { ok = false; return; }
        out.push({ id: newId(), type: 'barcode', left: round((w - bw) / 2), top: round(top), width: round(bw), height: round(height), text: s.r.text });
      } else {
        const side = Math.max(5, Math.min(height, avail));
        out.push({ id: newId(), type: 'qrcode', left: round((w - side) / 2), top: round(top), width: round(side), height: round(side), text: s.r.text });
      }
      top += height + s.gap;
    });
    if (ok && top - sized.at(-1)!.gap <= h - margin + 0.01) return out;
  }
  return null;
}

/** The suggestion for `variant`; when that arrangement does not fit, the next ones are tried, then just the name. */
export function suggestLayout(shape: Shape, use: UseCase, w: number, h: number, newId: () => string, variant = 0): SampleElement[] {
  for (let k = 0; k < VARIANTS; k++) {
    const out = tryLayout(shape, use, variant + k, w, h, newId);
    if (out) return out;
  }
  const margin = Math.max(1, Math.min(w, h) * 0.08);
  const pt = Math.max(4, Math.min(8, Math.min(w, h) * 0.22));
  const width = round(shape === 'rect' ? w - margin * 2 : w * 0.7);
  const height = textHeightMm(BRAND, width, pt, true);
  return [{ id: newId(), type: 'text', left: round((w - width) / 2), top: round((h - height) / 2), width, height, text: BRAND, fontSize: pt, bold: true, align: 'center' }];
}

/** How many labels sit side by side on the sheet: from "2 ups" in the name, else from repeated circles. */
export function detectUps(svg: string, name: string): number {
  const named = /(\d+)\s*-?\s*ups?\b/i.exec(name);
  if (named) return Math.min(6, Math.max(1, Number(named[1])));
  const circles = (svg.match(/<circle\b/gi) ?? []).length;
  return circles > 1 && circles <= 6 ? circles : 1;
}

/** One suggestion per label on the sheet, each placed inside its own cell. */
export function suggestForTemplate(svg: string, name: string, use: UseCase, w: number, h: number, newId: () => string, variant = 0): SampleElement[] {
  const ups = detectUps(svg, name);
  const cellW = w / ups;
  const shape = detectShape(svg, cellW, h);
  const cell = suggestLayout(shape, use, cellW, h, newId, variant);
  if (ups === 1) return cell;
  const out: SampleElement[] = [];
  for (let i = 0; i < ups; i++) {
    const copy = i === 0 ? cell : suggestLayout(shape, use, cellW, h, newId, variant);
    out.push(...copy.map((e) => ({ ...e, left: round(e.left + i * cellW) })));
  }
  return out;
}
