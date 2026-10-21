// Loads the SVG files in /templates into the Template table (category "All"), published.
//   npx tsx scripts/seed-templates.mts            insert new, update changed
//   npx tsx scripts/seed-templates.mts --dry-run  print what would happen
// The SVGs hold only the label outline (and the dotted fold line); nothing else is drawn, no sheet
// background. Safe to re-run; a template is matched by its name.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { PrismaClient } from '@prisma/client';

import { sanitizeSvg } from '../src/lib/catalog/sanitize-svg';
import { sampleTextHeightMm, type SampleElement } from '../../src/lib/template-sample';

process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const CATEGORY = 'All';
const dir = path.join(import.meta.dirname, '..', '..', 'templates');

type Node = Record<string, unknown>;

type Panel = { x: number; y: number; w: number; h: number; round?: boolean };
let n = 0;
const text = (left: number, top: number, width: number, t: string, fontSize: number, extra: Partial<SampleElement> = {}): SampleElement => ({
  id: `s${(n += 1)}`, type: 'text', left: r(left), top: r(top), width: r(width), height: sampleTextHeightMm(fontSize, t.split('\n').length), text: t, fontSize, ...extra,
});
const barcode = (left: number, top: number, width: number, height: number): SampleElement => ({ id: `s${(n += 1)}`, type: 'barcode', left: r(left), top: r(top), width: r(width), height: r(height), text: '8901234567890' });
const qr = (left: number, top: number, size: number): SampleElement => ({ id: `s${(n += 1)}`, type: 'qrcode', left: r(left), top: r(top), width: r(size), height: r(size), text: 'https://seznik.in' });
const rule = (left: number, top: number, width: number): SampleElement => ({ id: `s${(n += 1)}`, type: 'line', left: r(left), top: r(top), width: r(width), height: 0.4 });
function r(v: number) { return Math.round(v * 100) / 100; }

/** Sample content for one label panel, picked by its shape; positions are in mm on the whole sheet. */
function panelSample({ x, y, w, h, round }: Panel): SampleElement[] {
  const m = Math.max(1, Math.min(w, h) * 0.07);
  if (round) {
    const d = Math.min(w, h);
    const inner = d * 0.62;
    const left = x + (w - inner) / 2;
    return [
      text(left, y + d * 0.2, inner, 'SEZNIK', d * 0.2, { bold: true, align: 'center' }),
      text(left, y + d * 0.2 + sampleTextHeightMm(d * 0.2, 1) + 0.6, inner, 'Rs 249', d * 0.16, { align: 'center' }),
      barcode(left, y + d * 0.58, inner, d * 0.2),
    ];
  }
  if (h <= 16) {
    const half = (w - m * 3) / 2;
    return [
      text(x + m, y + m, half, 'GOLD RING', Math.min(7, h * 0.42), { bold: true }),
      text(x + m, y + m + sampleTextHeightMm(Math.min(7, h * 0.42), 1) + 0.4, half, 'Rs 24,950', Math.min(6, h * 0.36)),
      barcode(x + m * 2 + half, y + m, half, h - m * 2),
    ];
  }
  if (h <= 32 && w >= h * 1.4) {
    return [
      text(x + m, y + m, w * 0.6, 'GOLD RING 22K', 9, { bold: true }),
      text(x + m, y + m + 4.6, w * 0.6, 'Wt 2.450 g  HUID A61452', 6.5),
      rule(x + m, y + h * 0.5, w - m * 2),
      barcode(x + m, y + h * 0.56, w * 0.58, h * 0.34),
      text(x + w * 0.66, y + h * 0.6, w * 0.3, 'Rs 24,950', 9, { bold: true, align: 'right' }),
    ];
  }
  return [
    text(x + m, y + m, w - m * 2, 'SEZNIK LABELS', Math.min(12, w * 0.22), { bold: true, align: 'center' }),
    text(x + m, y + m + 6, w - m * 2, 'Premium thermal label\nSKU 1042  |  Qty 1', 7, { align: 'center' }),
    rule(x + m, y + h * 0.32, w - m * 2),
    qr(x + (w - Math.min(w * 0.5, h * 0.3)) / 2, y + h * 0.36, Math.min(w * 0.5, h * 0.3)),
    barcode(x + m, y + h * 0.72, w - m * 2, h * 0.16),
    text(x + m, y + h * 0.9, w - m * 2, 'Rs 249', 9, { bold: true, align: 'center' }),
  ];
}

/** Starter content for a template, or null to leave it to the app's built-in layout (jewellery). */
function starterSample(name: string, w: number, h: number): SampleElement[] | null {
  n = 0;
  if (/jewel/i.test(name)) return null;
  if (/cable/i.test(name)) {
    // Two flags 25 mm wide; the printable area is the wide block below the 30 mm fold.
    return [0.5, 27.4].flatMap((x) => panelSample({ x: x + 0.7, y: 31, w: 22.6, h: 42 }));
  }
  const round = /circle/i.test(name);
  if (/2up|two up/i.test(name)) {
    const pw = w / 2;
    return [0, pw].flatMap((x) => panelSample({ x, y: 0, w: pw, h, round }));
  }
  return panelSample({ x: 0, y: 0, w, h, round });
}
const opts = { preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, trimValues: false } as const;

/** Illustrator exports colours as <style> classes; the sanitiser drops both, so they become style="" first. */
function classStyles(raw: string): Map<string, string> {
  const rules = new Map<string, string>();
  const css = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(raw)?.[1] ?? '';
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decl = body.replace(/\s+/g, ' ').trim().replace(/;\s*$/, '');
    for (const sel of selectors.split(',')) {
      const cls = sel.trim().replace(/^\./, '');
      if (cls) rules.set(cls, `${rules.get(cls) ?? ''}${rules.has(cls) ? ';' : ''}${decl}`);
    }
  }
  return rules;
}

function inlineClasses(nodes: Node[], rules: Map<string, string>): Node[] {
  return nodes.map((node) => {
    const tag = Object.keys(node).find((k) => k !== ':@');
    if (!tag) return node;
    const attrs = { ...((node[':@'] as Record<string, string> | undefined) ?? {}) };
    const cls = attrs['@_class'];
    if (cls) {
      const style = cls.split(/\s+/).map((c) => rules.get(c)).filter(Boolean).join(';');
      delete attrs['@_class'];
      if (style) attrs['@_style'] = style;
    }
    const kids = node[tag];
    return { ...node, ':@': attrs, [tag]: Array.isArray(kids) ? inlineClasses(kids as Node[], rules) : kids };
  });
}

function clean(raw: string): string {
  const tree = new XMLParser(opts).parse(raw) as Node[];
  return new XMLBuilder({ ...opts, suppressEmptyNode: true }).build(inlineClasses(tree, classStyles(raw)));
}

/** "50x100 3up jewellery labelAsset 10Asset 19.svg" -> { name: "50x100 3up jewellery label", w: 50, h: 100 }. */
function parse(file: string) {
  const base = file.replace(/\.svg$/i, '').replace(/(Asset\s*\d+)+$/i, '').trim();
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i.exec(base);
  if (!m) throw new Error(`No WxH size in file name: ${file}`);
  // "2up" names give the width of one label; the sheet is two across.
  const across = /\b(2up|two up)\b/i.test(base) ? 2 : 1;
  return { name: base, widthMm: Number(m[1]) * across, heightMm: Number(m[2]) };
}

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.svg')).sort();
const category = dryRun
  ? { id: 'dry-run' }
  : await prisma.templateCategory.upsert({ where: { name: CATEGORY }, update: {}, create: { name: CATEGORY, sortOrder: 0 } });

for (const file of files) {
  const { name, widthMm, heightMm } = parse(file);
  const result = sanitizeSvg(clean(readFileSync(path.join(dir, file), 'utf8')));
  if (!result.ok) {
    console.log(`SKIP  ${file}: ${result.message}`);
    continue;
  }
  const data = { categoryId: category.id, name, svgCode: result.svg, widthMm, heightMm, viewBox: result.viewBox, contentHash: result.hash, status: 'published' };
  const starter = starterSample(name, widthMm, heightMm);
  if (dryRun) {
    console.log(`PLAN  ${name}  ${widthMm}x${heightMm}mm  ${result.bytes} bytes${result.unsupportedForApp.length ? `  app ignores: ${result.unsupportedForApp.join(', ')}` : ''}`);
    continue;
  }
  const existing = await prisma.template.findFirst({ where: { name } });
  // Sample content is only filled in when the admin has not designed one yet.
  const withSample = existing?.sampleLayout == null && starter ? { ...data, sampleLayout: starter } : data;
  if (!existing) {
    await prisma.template.create({ data: withSample });
    console.log(`ADDED ${name}`);
  } else if (existing.contentHash !== result.hash || existing.widthMm !== widthMm || existing.heightMm !== heightMm || withSample !== data) {
    await prisma.template.update({ where: { id: existing.id }, data: withSample });
    console.log(`UPDATED ${name}`);
  } else console.log(`same  ${name}`);
}
await prisma.$disconnect();
