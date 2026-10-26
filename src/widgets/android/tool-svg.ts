/**
 * The Home tile drawings (src/components/home/tool-art.tsx) as plain SVG strings, because a
 * home-screen widget cannot render react-native-svg. Light-theme palette, 46 × 46 box.
 */

// theme-fixed: widgets are drawn by the launcher, outside the app theme
export const WIDGET_COLORS = {
  bg: '#F4F7FB',
  surface: '#FFFFFF',
  text: '#1D2140',
  muted: '#666C88',
  accent: '#2DAFE5',
  ink: '#24275A',
  soft: '#DDF1FB',
} as const;

const INK = WIDGET_COLORS.ink;
const PAPER = WIDGET_COLORS.surface;
const SOFT = WIDGET_COLORS.soft;
const TAG = WIDGET_COLORS.accent;
const WHITE = '#FFFFFF'; // theme-fixed: lines on the cyan tag
const EXCEL_GREEN = '#1E8E4F'; // theme-fixed: Excel file mark
const PDF_RED = '#D9412B'; // theme-fixed: PDF file mark

function tag(x: number, y: number, w = 21, h = 15): string {
  const cy = y + h / 2;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3.5" fill="${TAG}" stroke="${INK}" stroke-width="2"/>` +
    `<circle cx="${x + 4.5}" cy="${cy}" r="1.6" fill="${PAPER}"/>` +
    `<path d="M${x + 8.5} ${cy - 2.5}h${w - 12.5}M${x + 8.5} ${cy + 2.5}h${w - 16.5}" stroke="${WHITE}" stroke-width="2" stroke-linecap="round"/>`
  );
}

const ART = {
  newLabel:
    `<rect x="5" y="7" width="30" height="23" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-dasharray="4 3"/>` +
    `<circle cx="31" cy="32" r="9" fill="${TAG}" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M31 27.5v9M26.5 32h9" stroke="${WHITE}" stroke-width="2.2" stroke-linecap="round"/>`,

  excel:
    `<rect x="5" y="5" width="29" height="34" rx="3.5" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M6 12.5V8.5a2.5 2.5 0 0 1 2.5-2.5h22a2.5 2.5 0 0 1 2.5 2.5v4z" fill="${EXCEL_GREEN}"/>` +
    `<path d="M6 19.5h27M6 26.5h27M6 33.5h14M15.5 13v25" stroke="${INK}" stroke-opacity="0.35" stroke-width="1.5"/>` +
    tag(23, 27),

  pdf:
    `<path d="M9 5h17l9 9v22a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M26 5v6.5a2.5 2.5 0 0 0 2.5 2.5H35" fill="${SOFT}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="3" y="17" width="20" height="10" rx="2.5" fill="${PDF_RED}"/>` +
    `<text x="13" y="24.6" font-size="7.5" font-weight="700" fill="${WHITE}" text-anchor="middle">PDF</text>` +
    tag(23, 28),

  shipping:
    `<path d="M5 15l15-8 15 8v19a2 2 0 0 1-1.2 1.8L20 42 6.2 35.8A2 2 0 0 1 5 34z" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M5 15l15 8 15-8M20 23v19" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M12.5 11l15 8v5" fill="none" stroke="${SOFT}" stroke-width="3.5" stroke-linejoin="round"/>` +
    tag(23, 28),

  serial:
    `<rect x="14" y="4" width="27" height="17" rx="3.5" fill="${PAPER}" stroke="${INK}" stroke-opacity="0.45" stroke-width="2"/>` +
    `<rect x="9" y="12" width="27" height="17" rx="3.5" fill="${PAPER}" stroke="${INK}" stroke-opacity="0.7" stroke-width="2"/>` +
    `<rect x="4" y="20" width="27" height="17" rx="3.5" fill="${TAG}" stroke="${INK}" stroke-width="2"/>` +
    `<circle cx="8.8" cy="28.5" r="1.6" fill="${PAPER}"/>` +
    `<text x="20.5" y="32.2" font-size="10" font-weight="700" fill="${WHITE}" text-anchor="middle">003</text>` +
    `<text x="33.5" y="10.5" font-size="6" font-weight="700" fill="${INK}" fill-opacity="0.55" text-anchor="end">001</text>`,
} as const;

export type WidgetToolArt = keyof typeof ART;

/** One tool's drawing as a standalone SVG string. */
export function toolSvg(id: WidgetToolArt): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46">${ART[id]}</svg>`;
}
