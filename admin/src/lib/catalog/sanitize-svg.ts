import { createHash } from 'crypto';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

// The app's own parser: what it can draw is what we validate against (see unsupportedForApp).
import { parseSvgDrawOps } from '../../../../src/lib/clipart/parse-svg';

export const MAX_SVG_BYTES = 500 * 1024;
const MAX_DEPTH = 20;
const MAX_NODES = 5000;
const MAX_ATTR_CHARS = 200_000;
const MAX_EMBEDDED_IMAGE_BYTES = 150 * 1024;

export type SanitizeFailure = { ok: false; code: string; message: string };
export type SanitizeSuccess = {
  ok: true;
  svg: string;
  bytes: number;
  hash: string;
  viewBox: string | null;
  widthMm: number | null;
  heightMm: number | null;
  /** What was taken out, e.g. [{ what: 'script', count: 1 }]. */
  removed: { what: string; count: number }[];
  warnings: string[];
  /** Shapes the app's SVG reader will draw. */
  drawOps: number;
  /** Things that are valid SVG but that the app ignores. */
  unsupportedForApp: string[];
};
export type SanitizeResult = SanitizeSuccess | SanitizeFailure;

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'path', 'circle', 'rect', 'ellipse', 'line', 'polygon', 'polyline',
  'text', 'tspan', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'symbol',
  'use', 'image', 'title', 'desc',
]);
const UNWRAP_ELEMENTS = new Set(['a']); // keep what is inside a link, drop the link

const ALLOWED_ATTRIBUTES = new Set([
  'id', 'viewBox', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'd', 'points',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'stroke-dashoffset', 'fill-rule', 'clip-rule', 'fill-opacity', 'stroke-opacity', 'opacity', 'transform',
  'gradientTransform', 'gradientUnits', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'fx', 'fy',
  'xmlns', 'xmlns:xlink', 'version', 'preserveAspectRatio', 'clip-path', 'mask', 'href', 'xlink:href', 'style',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing',
  'dx', 'dy', 'display', 'visibility', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
  'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'display', 'visibility', 'font-size',
  'font-family', 'font-weight', 'font-style', 'text-anchor', 'stop-color', 'stop-opacity',
]);

const DANGEROUS_VALUE = /(?:java|vb)script:|data:text|data:application|expression\s*\(|@import/i;
const INERT_ELEMENTS_FOR_APP = new Set(['text', 'tspan', 'image', 'use', 'linearGradient', 'radialGradient', 'clipPath', 'mask', 'symbol']);

type Node = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  commentPropName: '#comment',
  cdataPropName: '#cdata',
});
const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  suppressEmptyNode: true,
  format: false,
});

const fail = (code: string, message: string): SanitizeFailure => ({ ok: false, code, message });

function urlRefsAreLocal(value: string): boolean {
  const refs = value.match(/url\(\s*([^)]*)\)/gi) ?? [];
  return refs.every((ref) => /^url\(\s*['"]?#[^'")\s]+['"]?\s*\)$/i.test(ref));
}

function cleanStyle(value: string): string | null {
  const kept: string[] = [];
  for (const part of value.split(';')) {
    const [prop, ...rest] = part.split(':');
    const name = prop?.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (!name || !val || !ALLOWED_STYLE_PROPS.has(name)) continue;
    if (DANGEROUS_VALUE.test(val) || !urlRefsAreLocal(val)) continue;
    kept.push(`${name}:${val}`);
  }
  return kept.length ? kept.join(';') : null;
}

/** Parses "50mm", "2in", "100px", "12" into millimetres (unitless and px = 96 per inch). */
export function lengthToMm(raw: string | undefined | null): number | null {
  const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(mm|cm|in|px|pt|pc|q)?\s*$/i.exec(raw ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? 'px').toLowerCase();
  const perUnit: Record<string, number> = { mm: 1, cm: 10, in: 25.4, px: 25.4 / 96, pt: 25.4 / 72, pc: 25.4 / 6, q: 0.25 };
  return Math.round(n * perUnit[unit] * 100) / 100;
}

export function sanitizeSvg(input: Buffer | string): SanitizeResult {
  const bytes = typeof input === 'string' ? Buffer.byteLength(input) : input.length;
  if (bytes === 0) return fail('EMPTY_FILE', 'The file is empty.');
  if (bytes > MAX_SVG_BYTES) return fail('TOO_LARGE', `The file is larger than ${MAX_SVG_BYTES / 1024} KB.`);
  const text = (typeof input === 'string' ? input : input.toString('utf8')).replace(/^﻿/, '');
  if (text.includes('\u0000')) return fail('NOT_TEXT', 'That is not a text SVG file.');
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[\s*<!ENTITY/i.test(text)) {
    return fail('DOCTYPE', 'SVG files with a DOCTYPE or entity definitions are not accepted.');
  }

  let tree: Node[];
  try {
    tree = parser.parse(text) as Node[];
  } catch {
    return fail('INVALID_XML', 'The file is not valid XML.');
  }
  const rootNode = tree.find((n) => Object.keys(n).some((k) => k !== ':@' && k !== '#text' && k !== '#comment'));
  const rootName = rootNode ? Object.keys(rootNode).find((k) => k !== ':@') : undefined;
  if (!rootNode || rootName !== 'svg') return fail('NOT_SVG', 'The file does not start with an <svg> element.');

  const removed = new Map<string, number>();
  const unsupported = new Set<string>();
  const warnings: string[] = [];
  const note = (what: string) => removed.set(what, (removed.get(what) ?? 0) + 1);
  let nodes = 0;
  let tooDeep = false;
  let tooMany = false;

  function cleanAttributes(el: string, attrs: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!attrs) return undefined;
    const out: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(attrs)) {
      const name = key.slice(2); // drop "@_"
      const value = String(rawValue);
      if (/^on/i.test(name)) {
        note(`event handler (${name.toLowerCase()})`);
        continue;
      }
      if (!ALLOWED_ATTRIBUTES.has(name)) {
        if (name.includes(':') && !name.startsWith('xmlns')) note(`foreign attribute (${name.split(':')[0]}:)`);
        else note(`attribute (${name})`);
        continue;
      }
      if (value.length > MAX_ATTR_CHARS) {
        note(`oversized attribute (${name})`);
        continue;
      }
      const compact = value.replace(/[\s\u0000-\u001f]+/g, '');
      if (DANGEROUS_VALUE.test(compact) && !(name === 'href' || name === 'xlink:href')) {
        note(`dangerous value (${name})`);
        continue;
      }
      if (name === 'href' || name === 'xlink:href') {
        if (compact.startsWith('#')) {
          out['@_' + name] = value.trim();
        } else if (el === 'image' && /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/i.test(compact) && (compact.length * 3) / 4 <= MAX_EMBEDDED_IMAGE_BYTES) {
          out['@_' + name] = compact;
        } else {
          note(`external or unsafe link (${name})`);
        }
        continue;
      }
      if (name === 'style') {
        const style = cleanStyle(value);
        if (style) out['@_style'] = style;
        else note('style attribute');
        continue;
      }
      if (/url\(/i.test(value) && !urlRefsAreLocal(value)) {
        note(`external reference (${name})`);
        continue;
      }
      if (name === 'transform' || name === 'gradientTransform') unsupported.add('transform');
      out['@_' + name] = value;
    }
    return Object.keys(out).length ? out : undefined;
  }

  function cleanNodes(list: Node[], depth: number): Node[] {
    const result: Node[] = [];
    for (const node of list) {
      nodes += 1;
      if (nodes > MAX_NODES) {
        tooMany = true;
        return result;
      }
      if (depth > MAX_DEPTH) {
        tooDeep = true;
        return result;
      }
      if ('#text' in node) {
        result.push({ '#text': String(node['#text']) });
        continue;
      }
      if ('#comment' in node || '#cdata' in node) {
        note(node['#cdata'] ? 'cdata block' : 'comment');
        continue;
      }
      const el = Object.keys(node).find((k) => k !== ':@');
      if (!el) continue;
      const attrs = node[':@'] as Record<string, string> | undefined;
      const children = (node[el] as Node[]) ?? [];

      if (UNWRAP_ELEMENTS.has(el)) {
        note(`link (<${el}>)`);
        result.push(...cleanNodes(children, depth));
        continue;
      }
      if (!ALLOWED_ELEMENTS.has(el)) {
        note(el.includes(':') ? `foreign element (<${el.split(':')[0]}:>)` : `<${el}>`);
        if (el === 'style') warnings.push('A <style> block was removed; use fill/stroke attributes instead.');
        continue;
      }
      const cleaned = cleanAttributes(el, attrs);
      if (el === 'use' && !cleaned?.['@_href'] && !cleaned?.['@_xlink:href']) {
        note('<use> without a local target');
        continue;
      }
      if (el === 'image' && !cleaned?.['@_href'] && !cleaned?.['@_xlink:href']) {
        note('<image> without an embedded picture');
        continue;
      }
      if (INERT_ELEMENTS_FOR_APP.has(el)) unsupported.add(`<${el}>`);
      const out: Node = { [el]: cleanNodes(children, depth + 1) };
      if (cleaned) out[':@'] = cleaned;
      result.push(out);
    }
    return result;
  }

  const rootAttrs = rootNode[':@'] as Record<string, string> | undefined;
  const cleanedRootAttrs: Record<string, string> = { ...(cleanAttributes('svg', rootAttrs) ?? {}), '@_xmlns': 'http://www.w3.org/2000/svg' };
  const cleanedRoot: Node = { svg: cleanNodes((rootNode.svg as Node[]) ?? [], 1), ':@': cleanedRootAttrs };
  if (tooMany) return fail('TOO_COMPLEX', `The file has more than ${MAX_NODES} elements.`);
  if (tooDeep) return fail('TOO_DEEP', `Elements are nested more than ${MAX_DEPTH} levels deep.`);

  // size: viewBox and/or width + height
  const viewBoxRaw = cleanedRootAttrs['@_viewBox'];
  const vb = viewBoxRaw?.trim().split(/[\s,]+/).map(Number);
  const hasViewBox = !!vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const wMm = lengthToMm(cleanedRootAttrs['@_width']);
  const hMm = lengthToMm(cleanedRootAttrs['@_height']);
  if (!hasViewBox && !(wMm && hMm)) return fail('NO_SIZE', 'The SVG needs a viewBox or a width and height.');
  const widthMm = wMm ?? (hasViewBox ? Math.round(vb![2] * (25.4 / 96) * 100) / 100 : null);
  const heightMm = hMm ?? (hasViewBox ? Math.round(vb![3] * (25.4 / 96) * 100) / 100 : null);
  if (widthMm && heightMm && (widthMm > 5000 || heightMm > 5000)) return fail('BAD_SIZE', 'The SVG size is unreasonably large.');

  const svg = builder.build([cleanedRoot]) as string;
  const out = Buffer.from(svg, 'utf8');
  if (out.length > MAX_SVG_BYTES) return fail('TOO_LARGE', 'The cleaned file is still too large.');

  const drawOps = parseSvgDrawOps(svg).length;
  if (drawOps === 0) {
    return fail(
      'NOTHING_DRAWABLE',
      'The app can only draw paths, circles, rectangles, ellipses, lines and polygons; this file has none.',
    );
  }
  if (unsupported.size) {
    warnings.push(`The app ignores: ${[...unsupported].join(', ')}. Shapes using these will not look the same on the label.`);
  }

  return {
    ok: true,
    svg,
    bytes: out.length,
    hash: createHash('sha256').update(out).digest('hex'),
    viewBox: hasViewBox ? vb!.join(' ') : null,
    widthMm,
    heightMm,
    removed: [...removed].map(([what, count]) => ({ what, count })),
    warnings,
    drawOps,
    unsupportedForApp: [...unsupported],
  };
}
