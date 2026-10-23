import { createHash } from 'crypto';
import { Resvg } from '@resvg/resvg-js';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

import { lengthToMm, mmPerSvgUnit } from './svg-size';

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
export type SanitizeOptions = {
  /** Templates: drop faint or dashed guides and crop the viewBox to the shape that is left. */
  trimToMainShape?: boolean;
};

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

type ClassRule = { classes: string[]; decls: [string, string][] };

/** Text inside a <style> element, whether plain or wrapped in CDATA. */
function styleText(children: Node[]): string {
  return children
    .map((c) => {
      if ('#text' in c) return String(c['#text']);
      if ('#cdata' in c) return ((c['#cdata'] as Node[]) ?? []).map((t) => String(t['#text'] ?? '')).join('');
      return '';
    })
    .join('');
}

/**
 * Class rules from every <style> block, in source order, e.g. Illustrator's `.cls-1, .cls-2 { fill: none }`.
 * Only plain class selectors are read; `skipped` counts the rules that are anything else.
 */
function readClassRules(list: Node[]): { rules: ClassRule[]; skipped: number } {
  const rules: ClassRule[] = [];
  let skipped = 0;
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      const el = Object.keys(node).find((k) => k !== ':@');
      if (!el || el.startsWith('#')) continue;
      const children = (node[el] as Node[]) ?? [];
      if (el !== 'style') {
        walk(children);
        continue;
      }
      const css = styleText(children).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = selector.split(',').map((s) => s.trim());
        if (!selectors.every((s) => /^\.[\w-]+$/.test(s))) {
          skipped += 1;
          continue;
        }
        const decls = body
          .split(';')
          .map((d) => d.split(':'))
          .filter((d) => d.length >= 2)
          .map(([p, ...v]) => [p.trim().toLowerCase(), v.join(':').trim()] as [string, string])
          .filter(([p, v]) => p && v);
        rules.push({ classes: selectors.map((s) => s.slice(1)), decls });
      }
    }
  };
  walk(list);
  return { rules, skipped };
}

/** Faint (opacity below 1) or dashed: a guide such as a fold or cut line, not the label shape. */
function isGuide(attrs: Record<string, string> | undefined): boolean {
  if (!attrs) return false;
  const style = attrs['@_style'] ?? '';
  const read = (prop: string) => attrs['@_' + prop] ?? new RegExp(`(?:^|;)${prop}:([^;]+)`).exec(style)?.[1];
  const opacity = Number(read('opacity'));
  const dash = read('stroke-dasharray')?.trim();
  return (Number.isFinite(opacity) && opacity < 1) || (!!dash && dash !== 'none');
}

export { lengthToMm } from './svg-size';

export function sanitizeSvg(input: Buffer | string, options: SanitizeOptions = {}): SanitizeResult {
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
  const css = readClassRules(tree);

  /**
   * Copies <style> class rules onto the element as attributes, since the <style> block itself is removed.
   * Rules apply in source order, so a later rule wins, as in CSS. An existing style="" still wins.
   */
  function applyClassRules(attrs: Record<string, string> | undefined): Record<string, string> | undefined {
    const classAttr = attrs?.['@_class'];
    if (!attrs || classAttr === undefined) return attrs;
    const { '@_class': _class, ...out } = attrs;
    const classes = String(classAttr).split(/\s+/).filter(Boolean);
    for (const rule of css.rules) {
      if (!rule.classes.some((c) => classes.includes(c))) continue;
      for (const [prop, value] of rule.decls) {
        if (ALLOWED_ATTRIBUTES.has(prop)) out['@_' + prop] = value.replace(/^(-?[0-9.]+(?:e[+-]?\d+)?)px$/i, '$1');
      }
    }
    return out;
  }

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
      const attrs = applyClassRules(node[':@'] as Record<string, string> | undefined);
      const children = (node[el] as Node[]) ?? [];

      if (UNWRAP_ELEMENTS.has(el)) {
        note(`link (<${el}>)`);
        result.push(...cleanNodes(children, depth));
        continue;
      }
      if (!ALLOWED_ELEMENTS.has(el)) {
        note(el.includes(':') ? `foreign element (<${el.split(':')[0]}:>)` : `<${el}>`);
        if (el === 'style' && css.skipped) {
          warnings.push('Some <style> rules could not be copied onto the shapes; use fill/stroke attributes instead.');
        }
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

  const rootAttrs = applyClassRules(rootNode[':@'] as Record<string, string> | undefined);
  const cleanedRootAttrs: Record<string, string> = { ...(cleanAttributes('svg', rootAttrs) ?? {}), '@_xmlns': 'http://www.w3.org/2000/svg' };
  let cleanedRoot: Node = { svg: cleanNodes((rootNode.svg as Node[]) ?? [], 1), ':@': cleanedRootAttrs };
  if (tooMany) return fail('TOO_COMPLEX', `The file has more than ${MAX_NODES} elements.`);
  if (tooDeep) return fail('TOO_DEEP', `Elements are nested more than ${MAX_DEPTH} levels deep.`);

  // size: viewBox and/or width + height
  const viewBoxRaw = cleanedRootAttrs['@_viewBox'];
  const vb = viewBoxRaw?.trim().split(/[\s,]+/).map(Number);
  const hasViewBox = !!vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  // Illustrator works in points, so its px and bare viewBox units are 72 per inch, not 96.
  const pxMm = mmPerSvgUnit(text);
  const wMm = lengthToMm(cleanedRootAttrs['@_width'], pxMm);
  const hMm = lengthToMm(cleanedRootAttrs['@_height'], pxMm);
  if (!hasViewBox && !(wMm && hMm)) return fail('NO_SIZE', 'The SVG needs a viewBox or a width and height.');
  let widthMm = wMm ?? (hasViewBox ? Math.round(vb![2] * pxMm * 100) / 100 : null);
  let heightMm = hMm ?? (hasViewBox ? Math.round(vb![3] * pxMm * 100) / 100 : null);
  if (widthMm && heightMm && (widthMm > 5000 || heightMm > 5000)) return fail('BAD_SIZE', 'The SVG size is unreasonably large.');
  let viewBox = hasViewBox ? vb!.join(' ') : null;

  if (options.trimToMainShape) {
    // Guides out, unless that would leave nothing for the app to draw.
    let guides = 0;
    const stripGuides = (list: Node[]): Node[] =>
      list.flatMap((node) => {
        const el = Object.keys(node).find((k) => k !== ':@');
        if (!el || el.startsWith('#') || el === 'defs') return [node];
        if (isGuide(node[':@'] as Record<string, string> | undefined)) {
          guides += 1;
          return [];
        }
        return [{ ...node, [el]: stripGuides((node[el] as Node[]) ?? []) }];
      });
    const main: Node = { ...cleanedRoot, svg: stripGuides(cleanedRoot.svg as Node[]) };
    if (guides && parseSvgDrawOps(builder.build([main]) as string).length) {
      cleanedRoot = main;
      removed.set('faint or dashed guide', guides);
    }

    // Crop to what is drawn, stroke included, so the outline lines up with the label edge and is not clipped.
    const box = new Resvg(builder.build([cleanedRoot]) as string, { font: { loadSystemFonts: false } }).getBBox();
    if (box && box.width > 0 && box.height > 0) {
      const mmPerUnit = hasViewBox && widthMm && heightMm ? { x: widthMm / vb![2], y: heightMm / vb![3] } : { x: pxMm, y: pxMm };
      const before = hasViewBox ? { w: vb![2], h: vb![3] } : { w: (widthMm ?? 0) / mmPerUnit.x, h: (heightMm ?? 0) / mmPerUnit.y };
      if (box.width < before.w * 0.995 || box.height < before.h * 0.995) removed.set('space around the main shape', 1);
      const r = (n: number) => Math.round(n * 1000) / 1000;
      viewBox = [box.x, box.y, box.width, box.height].map(r).join(' ');
      widthMm = Math.round(box.width * mmPerUnit.x * 100) / 100;
      heightMm = Math.round(box.height * mmPerUnit.y * 100) / 100;
      // The size goes into the file in mm, so it stays readable once Illustrator's marks are cleaned out.
      const attrs = cleanedRoot[':@'] as Record<string, string>;
      cleanedRoot = { ...cleanedRoot, ':@': { ...attrs, '@_viewBox': viewBox, '@_width': `${widthMm}mm`, '@_height': `${heightMm}mm` } };
    }
  }

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
    viewBox,
    widthMm,
    heightMm,
    removed: [...removed].map(([what, count]) => ({ what, count })),
    warnings,
    drawOps,
    unsupportedForApp: [...unsupported],
  };
}
