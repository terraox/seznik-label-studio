// Loads the SVG files in /templates into the Template table (category "All"), published.
//   npx tsx --tsconfig ../tsconfig.json scripts/seed-templates.mts   insert new, update changed (the app's @/ imports need the root tsconfig)
//   npx tsx scripts/seed-templates.mts --dry-run  print what would happen
//   npx tsx scripts/seed-templates.mts --refresh-samples  also replace stored sample content
// The SVGs hold only the label outline (and the dotted fold line); nothing else is drawn, no sheet
// background. Safe to re-run; a template is matched by its name.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { PrismaClient } from '@prisma/client';

import { sanitizeSvg } from '../src/lib/catalog/sanitize-svg';
import type { SampleElement } from '../../src/lib/template-sample';
import { starterSample } from '../../src/lib/template-sample-starter';
import { createIndustryTemplateDocument } from '../../src/constants/template-documents';
import { JEWELRY_DIECUT_PREVIEW_SHEET } from '../../src/constants/jewelry-diecut';

process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
// Overwrites sample content that is already stored (otherwise only templates without one are filled).
const refreshSamples = process.argv.includes('--refresh-samples');
// Jewellery sheets go in their own category, everything else in General.
const CATEGORY = 'General';
const JEWELLERY = 'jewellery';
const dir = path.join(import.meta.dirname, '..', '..', 'templates');

type Node = Record<string, unknown>;

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

/** The jewellery sheet's own elements (what the app opens), as sample content in mm. */
function jewellerySample(name: string, w: number, h: number): SampleElement[] {
  const doc = createIndustryTemplateDocument({ name, category: 'Jewelry', widthMm: w, heightMm: h, previewType: JEWELRY_DIECUT_PREVIEW_SHEET });
  return doc.elements.flatMap((e): SampleElement[] => {
    const frame = { id: String(e.id), left: e.left, top: e.top, width: e.width, height: e.height };
    if (e.type === 'text') return [{ ...frame, type: 'text', text: e.text, fontSize: e.fontSize, bold: e.bold, align: e.align === 'center' || e.align === 'right' ? e.align : 'left' }];
    if (e.type === 'barcode') return [{ ...frame, type: 'barcode', text: e.content }];
    if (e.type === 'qrcode') return [{ ...frame, type: 'qrcode', text: e.content }];
    return [];
  });
}

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.svg')).sort();
const categoryFor = async (name: string) =>
  dryRun
    ? { id: 'dry-run' }
    : prisma.templateCategory.upsert({ where: { name }, update: {}, create: { name, sortOrder: name === CATEGORY ? 0 : 1 } });

for (const file of files) {
  const { name, widthMm, heightMm } = parse(file);
  const result = sanitizeSvg(clean(readFileSync(path.join(dir, file), 'utf8')), { trimToMainShape: true });
  if (!result.ok) {
    console.log(`SKIP  ${file}: ${result.message}`);
    continue;
  }
  const category = await categoryFor(/jewel/i.test(name) ? JEWELLERY : CATEGORY);
  const data = { categoryId: category.id, name, svgCode: result.svg, widthMm, heightMm, viewBox: result.viewBox, contentHash: result.hash, status: 'published' };
  const starter = /jewel/i.test(name) ? jewellerySample(name, widthMm, heightMm) : starterSample(name, widthMm, heightMm);
  if (dryRun) {
    console.log(`PLAN  ${name}  ${widthMm}x${heightMm}mm  ${result.bytes} bytes${result.unsupportedForApp.length ? `  app ignores: ${result.unsupportedForApp.join(', ')}` : ''}`);
    continue;
  }
  const existing = await prisma.template.findFirst({ where: { name } });
  // Sample content is only filled in when the admin has not designed one yet.
  const withSample = (refreshSamples || existing?.sampleLayout == null) && starter ? { ...data, sampleLayout: starter } : data;
  if (!existing) {
    await prisma.template.create({ data: withSample });
    console.log(`ADDED ${name}`);
  } else if (existing.contentHash !== result.hash || existing.widthMm !== widthMm || existing.heightMm !== heightMm || existing.categoryId !== category.id || withSample !== data) {
    await prisma.template.update({ where: { id: existing.id }, data: withSample });
    console.log(`UPDATED ${name}`);
  } else console.log(`same  ${name}`);
}
await prisma.$disconnect();
