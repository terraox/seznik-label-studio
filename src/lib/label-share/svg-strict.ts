/**
 * Strict allow-list SVG check for files from other people (clipart and templateSvg.xml).
 * The text is tokenised and REBUILT from allowed tags and attributes only, so nothing that is not
 * on the list can survive. This replaces the old regex deny-list for shared files.
 * Null means "not safe or not usable": the caller lists it as a missing item.
 */

import { LIMITS } from './limits';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath',
]);

const CANON: Record<string, string> = {
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  clippath: 'clipPath',
};

const ATTRS = new Set([
  'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'width', 'height',
  'points', 'viewbox', 'preserveaspectratio', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity',
  'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'transform', 'id', 'offset',
  'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'clip-path', 'clippathunits',
  'xmlns', 'version',
]);

const ATTR_CANON: Record<string, string> = {
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  clippathunits: 'clipPathUnits',
};

const MAX_DEPTH = 24;
const MAX_NODES = 5000;

/** A value is safe when it has no markup breakers, no scheme, no external url(). */
function safeValue(name: string, value: string): string | null {
  if (name === 'xmlns') return value === SVG_NS ? value : null;
  if (value.length > 20_000) return null;
  if (/[<>]/.test(value)) return null;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return null;
  const lower = value.toLowerCase();
  if (/(javascript|data|vbscript|file|https?):/.test(lower)) return null;
  if (lower.includes('@import') || lower.includes('expression(')) return null;
  const urls = lower.match(/url\([^)]*\)/g) ?? [];
  for (const u of urls) {
    if (!/^url\(\s*['"]?#[\w.-]+['"]?\s*\)$/.test(u)) return null;
  }
  // Entities other than the five predefined ones and numeric references are refused.
  const entities = value.match(/&[^;\s]*;?/g) ?? [];
  for (const e of entities) {
    if (!/^&(amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9a-fA-F]{1,6});$/.test(e)) return null;
  }
  return value;
}

function parseAttrs(raw: string): [string, string][] | null {
  const out: [string, string][] = [];
  const re = /([^\s=/"'<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(raw)) !== null) {
    const between = raw.slice(consumed, m.index);
    if (between.trim() !== '') return null;
    consumed = re.lastIndex;
    const name = m[1];
    const lower = name.toLowerCase();
    if (seen.has(lower)) return null;
    seen.add(lower);
    const value = m[2] ?? m[3] ?? '';
    if (lower.startsWith('xmlns:') || lower.startsWith('xlink:') || lower.startsWith('on')) return null;
    if (lower === 'style' || lower === 'class' || lower === 'href') return null;
    if (!ATTRS.has(lower)) continue; // unknown presentation attributes are dropped, not trusted
    const safe = safeValue(lower, value);
    if (safe === null) return null;
    out.push([ATTR_CANON[lower] ?? lower, safe]);
  }
  if (raw.slice(consumed).trim() !== '') return null;
  return out;
}

const escapeAttr = (v: string) => v.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;').replace(/"/g, '&quot;');

export function sanitizeSvgStrict(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length > LIMITS.svgBytes) return null;
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  // Whole-document refusals: DTD/entities/CDATA/processing instructions beyond the xml prolog.
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text)) return null;
  const body = text.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<\?/.test(body) || /<!/.test(body)) return null;

  const tagRe = /<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stack: string[] = [];
  let out = '';
  let pos = 0;
  let nodes = 0;
  let rootSeen = false;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    // Only whitespace is allowed between tags; text nodes carry nothing we draw.
    if (body.slice(pos, m.index).trim() !== '') return null;
    pos = tagRe.lastIndex;
    const closing = m[1] === '/';
    const nameLower = m[2].toLowerCase();
    if (nameLower.includes(':') || !TAGS.has(nameLower)) return null;
    const name = CANON[nameLower] ?? nameLower;
    if (closing) {
      if (stack.pop() !== name) return null;
      out += `</${name}>`;
      continue;
    }
    nodes += 1;
    if (nodes > MAX_NODES) return null;
    if (stack.length === 0) {
      if (rootSeen || name !== 'svg') return null;
      rootSeen = true;
    } else if (name === 'svg') {
      return null;
    }
    const attrs = parseAttrs(m[3]);
    if (!attrs) return null;
    const rendered = attrs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ');
    const open = `<${name}${rendered ? ` ${rendered}` : ''}`;
    if (m[4] === '/') {
      out += `${open}/>`;
    } else {
      stack.push(name);
      if (stack.length > MAX_DEPTH) return null;
      out += `${open}>`;
    }
  }
  if (body.slice(pos).trim() !== '') return null;
  if (stack.length !== 0 || !rootSeen) return null;
  return out;
}
