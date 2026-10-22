/**
 * SVG preview of a label, drawn in millimetres. This is a TEST BENCH preview, not the print
 * pipeline: positions, sizes and rotation are exact, text/barcode/QR are close, dither and
 * fonts are approximations.
 */

import { DRAWING_COLORS, applyTimeOffsets, formatLiveDateTime } from '@/components/editor/types';
import { barcodeBarsForMode } from '@/lib/barcode-code128';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import type { El } from './defaults';

export type Unit = 'mm' | 'cm' | 'in';
export type Doc = Record<string, any> & { widthMm: number; heightMm: number; elements: El[] };

export type RenderOptions = {
  pxPerMm: number;
  unit: Unit;
  showGrid: boolean;
  gridMm: number;
  selectedId: string | null;
  /** Rulers, margins, measurements. False = just the label, for export. */
  chrome: boolean;
  imageUrl: (uri: string) => string | null;
  clipartUrl: (id: string) => string | null;
  now: Date;
};

export const RULER_PX = 24;
export const PAD_PX = 28;
const INK = '#111111';
const PT_MM = 25.4 / 72;

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inkOf(index: number | undefined): string {
  const c = DRAWING_COLORS[index ?? 0] ?? INK;
  return !index || c === '#FFFFFF' ? INK : c;
}

export function fromMm(mm: number, unit: Unit): number {
  return unit === 'in' ? mm / 25.4 : unit === 'cm' ? mm / 10 : mm;
}
export function fmt(mm: number, unit: Unit): string {
  const v = fromMm(mm, unit);
  return `${(Math.round(v * (unit === 'in' ? 1000 : 100)) / (unit === 'in' ? 1000 : 100)).toString()} ${unit}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, el: El, fontMm: number): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * fontMm * 0.55;
  measureCtx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${fontMm * 20}px ${family(el)}`;
  return measureCtx.measureText(text).width / 20 + (el.charSpacing ?? 0) * text.length;
}
function family(el: El): string {
  const f = el.fontFamily;
  if (!f || f === 'Default') return 'system-ui, -apple-system, Roboto, sans-serif';
  if (f === 'Barcode') return 'monospace';
  return `"${String(f).replace(/"/g, '')}", system-ui, sans-serif`;
}

function wrapLines(el: El, text: string, fontMm: number): string[] {
  const out: string[] = [];
  const mode = el.autoWrapping ?? 'Word';
  for (const para of text.split('\n')) {
    if (mode === 'Close' || el.verticalDisplay) { out.push(para); continue; }
    if (mode === 'Char') {
      let line = '';
      for (const ch of para) {
        if (line && measure(line + ch, el, fontMm) > el.width) { out.push(line); line = ch; } else line += ch;
      }
      out.push(line);
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next, el, fontMm) > el.width) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

const lineMult = (el: El) => (el.lineSpacing === '1.5' ? 1.5 : el.lineSpacing === '2.0' ? 2 : el.lineSpacing === 'Custom' ? 1.75 : 1);

/** Box of an element in mm (text/time/serial without a stored height grow with their lines). */
export function boxOf(el: El): { w: number; h: number } {
  if (['text', 'degrees', 'time'].includes(el.type)) {
    const fontMm = (el.fontSize ?? 8.5) * PT_MM;
    const text = el.type === 'text' ? el.text : el.type === 'degrees' ? el.content : '2000-00-00 00:00:00';
    const lines = el.type === 'time' ? 1 : wrapLines(el, String(text ?? ''), fontMm).length;
    const auto = Math.max(2.4, fontMm * 1.25 * lineMult(el) * Math.max(1, lines));
    const stored = typeof el.height === 'number' && el.height > 0 ? el.height : 0;
    const autoHeight = el.type === 'time' ? !stored : el.autoTextHeight !== false && el.autoWrapping !== 'Close';
    return { w: el.width, h: autoHeight ? Math.max(auto, stored) : stored || auto };
  }
  return { w: el.width, h: el.height ?? 0 };
}

function textBlock(el: El, text: string, color: string, anti: boolean): string {
  const fontMm = (el.fontSize ?? 8.5) * PT_MM;
  const { h } = boxOf(el);
  const lines = el.type === 'time' ? [text] : wrapLines(el, text, fontMm);
  const lh = fontMm * 1.25 * lineMult(el);
  const align = el.align ?? 'left';
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const x = align === 'center' ? el.width / 2 : align === 'right' ? el.width : 0;
  const deco = [el.underline ? 'underline' : '', el.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ');
  const vertical = el.verticalDisplay;
  const tspans = lines
    .map((l, i) =>
      vertical
        ? [...l].map((ch, k) => `<tspan x="${x}" y="${(i * 0 + k + 1) * lh}">${esc(ch)}</tspan>`).join('')
        : `<tspan x="${x}" y="${(i + 1) * lh - (lh - fontMm) / 2 - fontMm * 0.18}">${esc(l)}</tspan>`,
    )
    .join('');
  return `${anti ? `<rect width="${el.width}" height="${h}" fill="${INK}"/>` : ''}
    <text font-family='${family(el)}' font-size="${fontMm}" font-weight="${el.bold ? 700 : 400}" font-style="${el.italic ? 'italic' : 'normal'}"
      text-decoration="${deco}" letter-spacing="${el.charSpacing ?? 0}" text-anchor="${anchor}" fill="${anti ? '#fff' : color}" style="white-space:pre">${tspans}</text>`;
}

function qrSvg(el: El, color: string): string {
  const m = generateQrMatrix(String(el.content || 'https://seznik.in'), el.errorLevel ?? 'M');
  if (el.encodeMode && el.encodeMode !== 'QRCode') {
    return `<rect width="${el.width}" height="${el.height}" fill="none" stroke="${color}" stroke-width="0.2" stroke-dasharray="1 1"/><text x="${el.width / 2}" y="${el.height / 2}" font-size="2" text-anchor="middle" fill="${color}">${esc(el.encodeMode)}</text>`;
  }
  if (!m) return `<rect width="${el.width}" height="${el.height}" fill="none" stroke="#c00" stroke-width="0.2"/>`;
  const qz = Math.max(0, parseInt(String(el.zoneSize), 10) || 0);
  const total = m.size + qz * 2;
  const cell = Math.min(el.width, el.height) / total;
  let d = '';
  for (let r = 0; r < m.size; r += 1) for (let c = 0; c < m.size; c += 1) {
    if (m.data[r * m.size + c]) d += `M${(c + qz) * cell} ${(r + qz) * cell}h${cell}v${cell}h${-cell}z`;
  }
  return `${el.antiColor ? `<rect width="${el.width}" height="${el.height}" fill="${INK}"/>` : ''}<path d="${d}" fill="${el.antiColor ? '#fff' : color}"/>`;
}

function barcodeSvg(el: El, color: string): string {
  const bars = barcodeBarsForMode(String(el.encodeMode ?? 'CODE-128'), String(el.content ?? ''));
  const fontMm = (el.fontSize ?? 12) * PT_MM;
  const text = el.textFlag !== 'Hide';
  const textH = text ? fontMm * 1.3 : 0;
  const barH = Math.max(0.5, el.height - textH);
  const top = el.textFlag === 'Top' ? textH : 0;
  const fg = el.antiColor ? '#fff' : color;
  const rects = (bars ?? []).map((b) => `<rect x="${b.x * el.width}" y="${top}" width="${b.width * el.width}" height="${barH}" fill="${fg}"/>`).join('');
  const label = text
    ? `<text x="${el.width / 2}" y="${el.textFlag === 'Top' ? fontMm : el.height - fontMm * 0.2}" font-size="${fontMm}" text-anchor="middle" font-family="monospace" fill="${fg}">${esc(el.content)}</text>`
    : '';
  const bad = bars ? '' : `<text x="${el.width / 2}" y="${el.height / 2}" font-size="2" text-anchor="middle" fill="#c00">invalid for ${esc(el.encodeMode)}</text>`;
  return `${el.antiColor ? `<rect width="${el.width}" height="${el.height}" fill="${INK}"/>` : ''}${rects}${label}${bad}`;
}

function tableSvg(el: El, color: string): string {
  const rows: number[] = el.rowHeights ?? [];
  const cols: number[] = el.columnWidths ?? [];
  let y = 0;
  let out = '';
  rows.forEach((rh, r) => {
    let x = 0;
    cols.forEach((cw, c) => {
      const cell = el.cells?.[r]?.[c];
      out += `<rect x="${x}" y="${y}" width="${cw}" height="${rh}" fill="none" stroke="${color}" stroke-width="${el.lineWidth ?? 0.5}"/>`;
      if (cell?.text) {
        const fm = (cell.fontSize ?? 10) * PT_MM;
        const al = cell.align ?? 'left';
        const tx = al === 'center' ? x + cw / 2 : al === 'right' ? x + cw - 0.4 : x + 0.4;
        out += `<text x="${tx}" y="${y + rh / 2 + fm * 0.35}" font-size="${fm}" font-family='${family(cell)}' font-weight="${cell.bold ? 700 : 400}" text-anchor="${al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start'}" fill="${inkOf(cell.drawingColorIndex)}">${esc(cell.text)}</text>`;
      }
      x += cw;
    });
    y += rh;
  });
  return out;
}

function elementBody(el: El, o: RenderOptions): string {
  const color = inkOf(el.drawingColorIndex);
  switch (el.type) {
    case 'text':
      return textBlock(el, String(el.text ?? ''), color, !!el.antiColor);
    case 'degrees': {
      const s = el.serial;
      const shown = s ? `${s.prefix ?? ''}${s.start ?? ''}${s.suffix ?? ''}` : String(el.content ?? '');
      return textBlock(el, shown, color, !!el.antiColor);
    }
    case 'time': {
      const d = applyTimeOffsets(o.now, el as never);
      return textBlock(el, formatLiveDateTime(d).replace(' ', ' '), color, !!el.antiColor);
    }
    case 'barcode':
      return barcodeSvg(el, color);
    case 'qrcode':
      return qrSvg(el, color);
    case 'line': {
      const t = Math.max(0.1, el.height || 0.5);
      if (el.lineStyle === 'slash') return `<line x1="0" y1="${t}" x2="${el.width}" y2="0" stroke="${color}" stroke-width="${t}"/>`;
      if (el.lineStyle === 'backslash') return `<line x1="0" y1="0" x2="${el.width}" y2="${t}" stroke="${color}" stroke-width="${t}"/>`;
      const dash = el.lineStyle === 'dashed' ? `stroke-dasharray="${Math.max(0.3, el.virtualInterval ?? 1)} ${Math.max(0.3, el.virtualInterval ?? 1)}"` : '';
      return `<line x1="0" y1="${t / 2}" x2="${el.width}" y2="${t / 2}" stroke="${color}" stroke-width="${t}" ${dash}/>`;
    }
    case 'shape': {
      const fill = el.fill ? el.fillColor || color : 'none';
      const sw = el.lineWidth ?? 0.5;
      const common = `fill="${fill}" stroke="${color}" stroke-width="${sw}"`;
      if (el.figureShape === 'oval' || el.figureShape === 'circle') {
        return `<ellipse cx="${el.width / 2}" cy="${el.height / 2}" rx="${el.width / 2 - sw / 2}" ry="${el.height / 2 - sw / 2}" ${common}/>`;
      }
      const r = el.figureShape === 'roundedRectangle' ? el.roundRadius ?? 2 : 0;
      return `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, el.width - sw)}" height="${Math.max(0, el.height - sw)}" rx="${r}" ${common}/>`;
    }
    case 'table':
      return tableSvg(el, color);
    case 'arctext': {
      const fm = (el.fontSize ?? 7.5) * PT_MM;
      const r = Math.max(1, Math.min(el.width, el.height) / 2 - fm);
      const cx = el.width / 2;
      const cy = el.height / 2;
      const id = `arc_${el.id}`;
      return `<path id="${id}" d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#9bb" stroke-width="0.1" stroke-dasharray="0.6 0.6"/>
        <text font-size="${fm}" font-family='${family(el)}' font-weight="${el.bold ? 700 : 400}" fill="${color}"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(el.text || (el.serial ? el.serial.start : ''))}</textPath></text>`;
    }
    case 'border': {
      const sw = el.lineWidth ?? 0.5;
      const dash = el.borderStyle === 'dashed' ? '2 1' : el.borderStyle === 'dotted' ? '0.4 0.8' : '';
      const r = /round|pill/.test(el.borderStyle) ? Math.min(el.width, el.height) * 0.12 : 0;
      const inner = el.borderStyle === 'double' || el.borderStyle === 'rounded-double'
        ? `<rect x="${sw * 3}" y="${sw * 3}" width="${Math.max(0, el.width - sw * 6)}" height="${Math.max(0, el.height - sw * 6)}" rx="${r}" fill="none" stroke="${color}" stroke-width="${sw}"/>` : '';
      return `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, el.width - sw)}" height="${Math.max(0, el.height - sw)}" rx="${r}" fill="none" stroke="${color}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>${inner}`;
    }
    case 'signature': {
      const d = (el.strokes ?? [])
        .map((s: any) => `<polyline points="${(s.points ?? []).map((p: any) => `${p.x * el.width},${p.y * el.height}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${s.strokeWidth * el.width}" stroke-linecap="round" stroke-linejoin="round"/>`)
        .join('');
      return d || `<rect width="${el.width}" height="${el.height}" fill="none" stroke="#999" stroke-dasharray="1 1" stroke-width="0.2"/>`;
    }
    case 'image': {
      const url = o.imageUrl(el.printUri || el.uri || '');
      if (!url) return `<rect width="${el.width}" height="${el.height}" fill="#eee" stroke="#c00" stroke-width="0.2"/><text x="${el.width / 2}" y="${el.height / 2}" font-size="2" text-anchor="middle" fill="#c00">no picture</text>`;
      const fit = el.contentFit === 'fill' ? 'none' : el.contentFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
      const bw = el.colorMode === 'B & W' || el.colorMode === 'Halftone' || el.imageMode;
      const filter = [bw ? 'grayscale(1) contrast(8)' : '', el.invert || el.antiColor ? 'invert(1)' : ''].filter(Boolean).join(' ');
      const sx = el.flipH ? -1 : 1;
      const sy = el.flipV ? -1 : 1;
      return `<g transform="translate(${el.flipH ? el.width : 0} ${el.flipV ? el.height : 0}) scale(${sx} ${sy})"><svg x="0" y="0" width="${el.width}" height="${el.height}" overflow="hidden"><image href="${url}" width="${el.width}" height="${el.height}" preserveAspectRatio="${fit}" style="${filter ? `filter:${filter}` : ''}"/></svg></g>`;
    }
    case 'clipart': {
      const url = o.clipartUrl(el.clipartId);
      if (url) return `<image href="${url}" width="${el.width}" height="${el.height}" preserveAspectRatio="xMidYMid meet"/>`;
      return `<rect width="${el.width}" height="${el.height}" fill="#f3f3ff" stroke="#66c" stroke-width="0.2" stroke-dasharray="1 0.6"/><text x="${el.width / 2}" y="${el.height / 2}" font-size="${Math.min(2, el.width / 6)}" text-anchor="middle" fill="#449">${esc(el.clipartId)}</text>`;
    }
    default:
      return `<rect width="${el.width}" height="${el.height ?? 4}" fill="none" stroke="#c00" stroke-width="0.2"/>`;
  }
}

/** Border first, then zIndex, then array order, exactly like the phone (sortLayers). */
export function layerOrder(elements: El[]): El[] {
  return elements
    .map((e, i) => [e, i] as const)
    .sort((a, b) => {
      if (a[0].type === 'border' && b[0].type !== 'border') return -1;
      if (b[0].type === 'border' && a[0].type !== 'border') return 1;
      return (a[0].zIndex ?? 0) - (b[0].zIndex ?? 0) || a[1] - b[1];
    })
    .map(([e]) => e);
}

function ruler(doc: Doc, o: RenderOptions): string {
  const s = o.pxPerMm;
  const ox = RULER_PX + PAD_PX;
  const oy = RULER_PX + PAD_PX;
  const majors = o.unit === 'in' ? [25.4 / 8, 25.4 / 4, 25.4 / 2, 25.4, 50.8] : o.unit === 'cm' ? [5, 10, 20, 50, 100] : [1, 2, 5, 10, 20, 50, 100];
  const major = majors.find((m) => m * s >= 48) ?? majors[majors.length - 1];
  const minor = major / (o.unit === 'in' ? 4 : major === 2 ? 2 : 5);
  let out = `<rect x="0" y="0" width="${ox + doc.widthMm * s + PAD_PX}" height="${RULER_PX}" fill="#f1f3f8"/><rect x="0" y="0" width="${RULER_PX}" height="${oy + doc.heightMm * s + PAD_PX}" fill="#f1f3f8"/>`;
  const label = (mm: number) => {
    const v = fromMm(mm, o.unit);
    return `${Math.round(v * 1000) / 1000}`;
  };
  for (let mm = 0; mm <= doc.widthMm + 1e-6; mm += minor) {
    const isMajor = Math.abs(mm / major - Math.round(mm / major)) < 1e-6;
    const x = ox + mm * s;
    out += `<line x1="${x}" y1="${RULER_PX}" x2="${x}" y2="${RULER_PX - (isMajor ? 12 : 5)}" stroke="#667" stroke-width="1"/>`;
    if (isMajor) out += `<text x="${x + 2}" y="10" font-size="9" fill="#445">${label(mm)}</text>`;
  }
  for (let mm = 0; mm <= doc.heightMm + 1e-6; mm += minor) {
    const isMajor = Math.abs(mm / major - Math.round(mm / major)) < 1e-6;
    const y = oy + mm * s;
    out += `<line x1="${RULER_PX}" y1="${y}" x2="${RULER_PX - (isMajor ? 12 : 5)}" y2="${y}" stroke="#667" stroke-width="1"/>`;
    if (isMajor) out += `<text x="1" y="${y + 10}" font-size="8" fill="#445" text-anchor="start">${label(mm)}</text>`;
  }
  out += `<text x="4" y="${RULER_PX - 8}" font-size="9" font-weight="700" fill="#24275a">${o.unit}</text>`;
  return out;
}

function scaleBar(doc: Doc, o: RenderOptions): string {
  const s = o.pxPerMm;
  const options = o.unit === 'in' ? [25.4, 50.8, 127] : [5, 10, 20, 50, 100];
  const len = options.find((m) => m * s >= 80) ?? options[options.length - 1];
  const x = RULER_PX + PAD_PX;
  const y = RULER_PX + PAD_PX + doc.heightMm * s + 20;
  return `<g><line x1="${x}" y1="${y}" x2="${x + len * s}" y2="${y}" stroke="#24275a" stroke-width="2"/><line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="#24275a" stroke-width="2"/><line x1="${x + len * s}" y1="${y - 4}" x2="${x + len * s}" y2="${y + 4}" stroke="#24275a" stroke-width="2"/><text x="${x + 4}" y="${y - 6}" font-size="11" fill="#24275a">scale bar = ${fmt(len, o.unit)} (${(s).toFixed(2)} px/mm)</text></g>`;
}

function hud(doc: Doc, el: El, o: RenderOptions): string {
  const { w, h } = boxOf(el);
  const s = o.pxPerMm;
  const fs = 10 / s;
  const sw = 1 / s;
  const cy = el.top + h / 2;
  const cx = el.left + w / 2;
  const right = doc.widthMm - (el.left + w);
  const bottom = doc.heightMm - (el.top + h);
  const g = (x1: number, y1: number, x2: number, y2: number, v: number, tx: number, ty: number) =>
    Math.abs(v) < 1e-9 ? '' : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e5484d" stroke-width="${sw}" stroke-dasharray="${4 / s} ${3 / s}"/><text x="${tx}" y="${ty}" font-size="${fs}" fill="#e5484d" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="${3 / s}">${fmt(v, o.unit)}</text>`;
  return `<g pointer-events="none">
    ${g(0, cy, el.left, cy, el.left, el.left / 2, cy - 3 / s)}
    ${g(el.left + w, cy, doc.widthMm, cy, right, el.left + w + right / 2, cy - 3 / s)}
    ${g(cx, 0, cx, el.top, el.top, cx + 10 / s, el.top / 2)}
    ${g(cx, el.top + h, cx, doc.heightMm, bottom, cx + 10 / s, el.top + h + bottom / 2)}
    <text x="${el.left + w / 2}" y="${el.top + h + 13 / s}" font-size="${fs}" fill="#0b6cf0" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="${3 / s}">${fmt(w, o.unit)} × ${fmt(h, o.unit)}</text>
    <text x="${el.left}" y="${el.top - 4 / s}" font-size="${fs}" fill="#0b6cf0" paint-order="stroke" stroke="#fff" stroke-width="${3 / s}">(${fmt(el.left, o.unit)}, ${fmt(el.top, o.unit)})</text>
  </g>`;
}

export function renderLabel(doc: Doc, o: RenderOptions): { svg: string; width: number; height: number } {
  const s = o.pxPerMm;
  const ox = o.chrome ? RULER_PX + PAD_PX : 0;
  const oy = ox;
  const width = o.chrome ? ox + doc.widthMm * s + PAD_PX : doc.widthMm * s;
  const height = o.chrome ? oy + doc.heightMm * s + PAD_PX + 36 : doc.heightMm * s;
  const bg = doc.background?.type === 'color' ? doc.background.color : doc.background?.type === 'image' ? '#fff' : doc.paperType === 'Transparent' ? 'none' : '#fff';
  const bgImage = doc.background?.type === 'image' ? o.imageUrl(doc.background.uri) : null;
  const shape = doc.mediaShape;
  const clipId = 'labelClip';
  const clip =
    shape === 'circle' || shape === 'ellipse'
      ? `<ellipse cx="${doc.widthMm / 2}" cy="${doc.heightMm / 2}" rx="${doc.widthMm / 2}" ry="${doc.heightMm / 2}"/>`
      : shape === 'roundedRectangle'
        ? `<rect width="${doc.widthMm}" height="${doc.heightMm}" rx="${Math.min(doc.widthMm, doc.heightMm) * 0.1}"/>`
        : `<rect width="${doc.widthMm}" height="${doc.heightMm}"/>`;
  const grid =
    o.chrome && o.showGrid
      ? Array.from({ length: Math.floor(doc.widthMm / o.gridMm) + 1 }, (_, i) => `<line x1="${i * o.gridMm}" y1="0" x2="${i * o.gridMm}" y2="${doc.heightMm}" stroke="#4aa3ff" stroke-opacity=".35" stroke-width="${0.5 / s}"/>`).join('') +
        Array.from({ length: Math.floor(doc.heightMm / o.gridMm) + 1 }, (_, i) => `<line x1="0" y1="${i * o.gridMm}" x2="${doc.widthMm}" y2="${i * o.gridMm}" stroke="#4aa3ff" stroke-opacity=".35" stroke-width="${0.5 / s}"/>`).join('')
      : '';
  const items = layerOrder(doc.elements)
    .filter((e) => e.visible !== false)
    .map((el) => {
      const { w, h } = boxOf(el);
      const rot = el.rotation ? ` rotate(${el.rotation} ${w / 2} ${h / 2})` : '';
      const dim = el.needPrinting === false && o.chrome ? ' opacity=".45"' : el.opacity != null ? ` opacity="${el.opacity}"` : '';
      const sel = o.chrome && o.selectedId === el.id;
      return `<g data-el="${esc(el.id)}" transform="translate(${el.left} ${el.top})${rot}"${dim} style="cursor:${el.lockMovement ? 'not-allowed' : 'move'}">
        <rect width="${Math.max(w, 0.5)}" height="${Math.max(h, 0.5)}" fill="transparent"/>${elementBody(el, o)}
        ${sel ? `<rect width="${w}" height="${h}" fill="none" stroke="#0b6cf0" stroke-width="${1.5 / s}" pointer-events="none"/><rect data-handle="se" x="${w - 5 / s}" y="${h - 5 / s}" width="${10 / s}" height="${10 / s}" fill="#0b6cf0" style="cursor:nwse-resize"/>` : ''}
      </g>`;
    })
    .join('');
  const sel = o.chrome ? doc.elements.find((e) => e.id === o.selectedId) : null;
  const body = `<g transform="translate(${ox} ${oy}) scale(${s})">
      <defs><clipPath id="${clipId}">${clip}</clipPath></defs>
      <g ${shape && shape !== 'rectangle' ? `clip-path="url(#${clipId})"` : ''}>
        ${bg === 'none' ? '' : `<rect width="${doc.widthMm}" height="${doc.heightMm}" fill="${bg}"/>`}
        ${bgImage ? `<image href="${bgImage}" width="${doc.widthMm}" height="${doc.heightMm}" preserveAspectRatio="none"/>` : ''}
        ${grid}${items}
      </g>
      <g pointer-events="none">${o.chrome ? `<g fill="none" stroke="#99a" stroke-width="${1 / s}">${clip.replace('/>', ` fill="none"/>`)}</g>` : ''}</g>
      ${sel ? hud(doc, sel, o) : ''}
    </g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" id="stage">${o.chrome ? `<rect width="${width}" height="${height}" fill="#e9ecf3"/>` : ''}${body}${o.chrome ? ruler(doc, o) + scaleBar(doc, o) : ''}</svg>`;
  return { svg, width, height };
}
