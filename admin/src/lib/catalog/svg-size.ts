/**
 * Physical size of an SVG in millimetres. No Node imports, so the upload form and the viewer can use it too.
 *
 * Absolute width/height (mm, cm, in, pt, pc, q) are exact. Otherwise the viewBox is read in user units:
 * Illustrator draws in points (72 per inch), everything else in CSS pixels (96 per inch).
 */

/** Adobe Illustrator's marks: generator comment, its namespace, "Layer_1" ids, data-name, "cls-1" classes. */
export function isIllustratorSvg(text: string): boolean {
  return /Adobe Illustrator|xmlns:i=|&ns_ai;|\sid="Layer_\d|\sdata-name="|\sclass="cls-\d/.test(text);
}

/** Millimetres per user unit (and per px): 72 per inch for Illustrator, 96 per inch otherwise. */
export function mmPerSvgUnit(text: string): number {
  return isIllustratorSvg(text) ? 25.4 / 72 : 25.4 / 96;
}

/** Parses "50mm", "2in", "100px", "12" into millimetres; px and unitless use `pxMm` (default 96 per inch). */
export function lengthToMm(raw: string | undefined | null, pxMm = 25.4 / 96): number | null {
  const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(mm|cm|in|px|pt|pc|q)?\s*$/i.exec(raw ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? 'px').toLowerCase();
  const perUnit: Record<string, number> = { mm: 1, cm: 10, in: 25.4, px: pxMm, pt: 25.4 / 72, pc: 25.4 / 6, q: 0.25 };
  return Math.round(n * perUnit[unit] * 100) / 100;
}

export type SvgSize = { widthMm: number; heightMm: number; from: string };

/** The size the file itself says, and where it came from, or null when it has neither width/height nor a viewBox. */
export function detectSvgSizeMm(text: string): SvgSize | null {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(root)?.[1];
  const illustrator = isIllustratorSvg(text);
  const pxMm = illustrator ? 25.4 / 72 : 25.4 / 96;
  const w = lengthToMm(attr('width'), pxMm);
  const h = lengthToMm(attr('height'), pxMm);
  if (w && h) return { widthMm: w, heightMm: h, from: 'width and height' };
  const box = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return null;
  const r = (n: number) => Math.round(n * pxMm * 100) / 100;
  return { widthMm: r(box[2]), heightMm: r(box[3]), from: illustrator ? 'viewBox, Illustrator points (72 per inch)' : 'viewBox, pixels (96 per inch)' };
}
