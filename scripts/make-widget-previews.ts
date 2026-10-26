// Renders the picker preview PNGs for the Android home-screen widgets (assets/widget-previews).
// Run: npx tsx --tsconfig tsconfig.json scripts/make-widget-previews.ts   (needs rsvg-convert)
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { toolSvg, WIDGET_COLORS as W, type WidgetToolArt } from '../src/widgets/android/tool-svg';

const OUT = path.join(__dirname, '..', 'assets', 'widget-previews');
const WIDTH = 500;
const HEIGHT = 250;
const PAD = 16;
const GAP = 14;

function inner(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

type Tile = { label: string; hint: string; art: string };

function row(tiles: Tile[], y: number, h: number): string {
  const w = (WIDTH - PAD * 2 - GAP * (tiles.length - 1)) / tiles.length;
  return tiles
    .map((t, i) => {
      const x = PAD + i * (w + GAP);
      const cx = x + w / 2;
      const big = h > 150;
      const k = big ? 1.65 : 1.15;
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${W.surface}"/>` +
        `<g transform="translate(${cx - 23 * k} ${big ? y + h / 2 - 62 : y + 8}) scale(${k})">${t.art}</g>` +
        `<text x="${cx}" y="${big ? y + h / 2 + 38 : y + h - 30}" font-family="Helvetica, Arial, sans-serif" font-size="${big ? 20 : 17}" font-weight="700" fill="${W.text}" text-anchor="middle">${t.label}</text>` +
        `<text x="${cx}" y="${big ? y + h / 2 + 62 : y + h - 10}" font-family="Helvetica, Arial, sans-serif" font-size="${big ? 16 : 13}" fill="${W.muted}" text-anchor="middle">${t.hint}</text>`
      );
    })
    .join('');
}

function frame(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" rx="34" fill="${W.bg}"/>${body}</svg>`
  );
}

const art = (id: WidgetToolArt) => inner(toolSvg(id));

function logo(name: string): string {
  const b64 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'images', 'platforms', `${name}.png`)).toString('base64');
  return `<clipPath id="c-${name}"><rect x="0" y="0" width="46" height="46" rx="11"/></clipPath><image width="46" height="46" clip-path="url(#c-${name})" href="data:image/png;base64,${b64}"/>`;
}

const rowH = (HEIGHT - PAD * 2 - GAP) / 2;
const previews: Record<string, string> = {
  seznikfeatures: frame(
    row(
      [
        { label: 'New Label', hint: 'Start blank', art: art('newLabel') },
        { label: 'PDF', hint: 'Print any page', art: art('pdf') },
        { label: 'Shipping Labels', hint: 'Marketplace PDFs', art: art('shipping') },
      ],
      PAD,
      rowH,
    ) +
      row(
        [
          { label: 'Excel', hint: 'Bulk from a sheet', art: art('excel') },
          { label: 'Serial Labels', hint: '001, 002, 003…', art: art('serial') },
        ],
        PAD + rowH + GAP,
        rowH,
      ),
  ),
  seznikshipping: frame(
    row(
      ['amazon', 'flipkart', 'meesho'].map((n) => ({
        label: n[0].toUpperCase() + n.slice(1),
        hint: 'Shipping labels',
        art: logo(n),
      })),
      PAD,
      HEIGHT - PAD * 2,
    ),
  ),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, svg] of Object.entries(previews)) {
  const svgPath = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(svgPath, svg);
  execFileSync('rsvg-convert', [svgPath, '-o', path.join(OUT, `${name}.png`)]);
  fs.unlinkSync(svgPath);
  console.log('wrote', `assets/widget-previews/${name}.png`);
}
