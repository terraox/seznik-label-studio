import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { HomeToolId } from '@/components/home/home-tools';
import { C, useThemeRefresh } from '@/theme';

/**
 * Home tile art. Every tool is drawn as its source turning into the same cyan label tag
 * (sheet, PDF, photo, soft copy, numbered stack, parcel), so the grid reads as one family.
 * Navy ink and cyan come from the theme; the small file marks keep their familiar colours.
 */

const EXCEL_GREEN = '#1E8E4F'; // theme-fixed: Excel file mark
const PDF_RED = '#D9412B'; // theme-fixed: PDF file mark
const SUN = '#F2A93B'; // theme-fixed: photo sun
const TAG_TEXT = '#FFFFFF'; // theme-fixed: lines on the cyan tag
export const LOGO_CYAN = '#31C3F2'; // theme-fixed: top of the Seznik logo swoosh
export const LOGO_BLUE = '#2C7AB9'; // theme-fixed: middle of the Seznik logo swoosh
export const LOGO_NAVY = '#2F2E7E'; // theme-fixed: tail of the Seznik logo swoosh

/** The swoosh from the Seznik logo (admin/public/seznik_logo.png), traced into a 28.3 × 24 box. */
export const LOGO_SWOOSH =
  'M8 0C8 0 7.9 0.6 7.8 1.2C7.7 1.8 7.4 2.7 7.3 3.5C7.2 4.3 7.1 5.1 7 5.8C6.9 6.5 6.9 7.1 6.9 7.7C6.9 8.3 6.9 8.9 7 9.6C7.1 10.3 7.1 11.1 7.3 11.9C7.5 12.6 7.8 13.4 8.2 14.2C8.6 14.9 9 15.7 9.6 16.5C10.2 17.2 11.1 18.1 11.8 18.7C12.5 19.4 13 19.8 13.9 20.3C14.8 20.8 16.1 21.4 17.1 21.8C18.2 22.2 19.2 22.4 20.3 22.7C21.5 23 22.8 23.3 24.1 23.5C25.4 23.7 28.3 24 28.3 24C28.3 24 25.5 23.9 24.1 23.8C22.6 23.8 21.2 23.8 19.7 23.6C18.1 23.4 16.2 23 14.9 22.7C13.7 22.4 13.2 22.2 12.2 21.8C11.2 21.4 9.8 20.8 8.8 20.3C7.9 19.8 7.4 19.4 6.6 18.7C5.8 18.1 4.7 17.2 4 16.5C3.3 15.7 2.8 14.9 2.4 14.2C1.9 13.4 1.6 12.5 1.3 11.9C1 11.3 0.9 10.8 0.8 10.4C0.6 9.9 0.5 9.3 0.5 9C0.4 8.6 0.3 8.5 0.2 8.2C0.2 8 0 7.4 0 7.4C0 7.4 0.3 7.8 0.6 8C0.9 8.2 1.3 8.4 1.6 8.5C1.9 8.5 2.3 8.2 2.6 8.1C2.9 7.9 3.1 7.8 3.3 7.6C3.5 7.5 3.5 7.4 3.7 7.2C3.9 6.9 4.2 6.6 4.4 6.2C4.6 5.9 4.7 5.8 5 5.3C5.3 4.9 5.8 4 6.1 3.5C6.4 3 6.6 2.5 6.9 2.1C7.1 1.7 7.3 1.4 7.5 1.1C7.7 0.7 8 0 8 0Z';

type Palette = { ink: string; paper: string; soft: string; tag: string };

/** The cyan label tag: rounded body, a punched hole and two text lines. */
function Tag({ x, y, w = 21, h = 15, p }: { x: number; y: number; w?: number; h?: number; p: Palette }) {
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={3.5} fill={p.tag} stroke={p.ink} strokeWidth={2} />
      <Circle cx={x + 4.5} cy={y + h / 2} r={1.6} fill={p.paper} />
      <Path d={`M${x + 8.5} ${y + h / 2 - 2.5}h${w - 12.5}`} stroke={TAG_TEXT} strokeWidth={2} strokeLinecap="round" />
      <Path d={`M${x + 8.5} ${y + h / 2 + 2.5}h${w - 16.5}`} stroke={TAG_TEXT} strokeWidth={2} strokeLinecap="round" />
    </G>
  );
}

function ExcelArt({ p }: { p: Palette }) {
  return (
    <G>
      <Rect x={5} y={5} width={29} height={34} rx={3.5} fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <Path d="M6 12.5V8.5a2.5 2.5 0 0 1 2.5-2.5h22a2.5 2.5 0 0 1 2.5 2.5v4z" fill={EXCEL_GREEN} />
      <Path d="M6 19.5h27M6 26.5h27M6 33.5h14M15.5 13v25" stroke={p.ink} strokeOpacity={0.35} strokeWidth={1.5} />
      <Tag x={23} y={27} p={p} />
    </G>
  );
}

function PdfArt({ p }: { p: Palette }) {
  return (
    <G>
      <Path d="M9 5h17l9 9v22a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill={p.paper} stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M26 5v6.5a2.5 2.5 0 0 0 2.5 2.5H35" fill={p.soft} stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />
      <Rect x={3} y={17} width={20} height={10} rx={2.5} fill={PDF_RED} />
      <SvgText x={13} y={24.6} fontSize={7.5} fontWeight="700" fill={TAG_TEXT} textAnchor="middle">
        PDF
      </SvgText>
      <Tag x={23} y={28} p={p} />
    </G>
  );
}

/** A soft copy of a label inside camera-style corners, landing as a tag. */
function UploadArt({ p }: { p: Palette }) {
  return (
    <G>
      <Path d="M4 11V7a3 3 0 0 1 3-3h4M30 4h4a3 3 0 0 1 3 3v4M4 26v4a3 3 0 0 0 3 3h4" fill="none" stroke={p.tag} strokeWidth={2.5} strokeLinecap="round" />
      <Rect x={9} y={9} width={23} height={18} rx={3} fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <Path d="M13 14v8M15.5 14v8M19 14v8M21 14v8M24.5 14v8M27.5 14v8" stroke={p.ink} strokeWidth={1.6} />
      <Tag x={23} y={28} p={p} />
    </G>
  );
}

/** Three tags in a run, the front one numbered. */
function SerialArt({ p }: { p: Palette }) {
  return (
    <G>
      <Rect x={14} y={4} width={27} height={17} rx={3.5} fill={p.paper} stroke={p.ink} strokeOpacity={0.45} strokeWidth={2} />
      <Rect x={9} y={12} width={27} height={17} rx={3.5} fill={p.paper} stroke={p.ink} strokeOpacity={0.7} strokeWidth={2} />
      <Rect x={4} y={20} width={27} height={17} rx={3.5} fill={p.tag} stroke={p.ink} strokeWidth={2} />
      <Circle cx={8.8} cy={28.5} r={1.6} fill={p.paper} />
      <SvgText x={20.5} y={32.2} fontSize={10} fontWeight="700" fill={TAG_TEXT} textAnchor="middle">
        003
      </SvgText>
      <SvgText x={33.5} y={10.5} fontSize={6} fontWeight="700" fill={p.ink} fillOpacity={0.55} textAnchor="end">
        001
      </SvgText>
    </G>
  );
}

function ShippingArt({ p }: { p: Palette }) {
  return (
    <G>
      <Path d="M5 15l15-8 15 8v19a2 2 0 0 1-1.2 1.8L20 42 6.2 35.8A2 2 0 0 1 5 34z" fill={p.paper} stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M5 15l15 8 15-8M20 23v19" fill="none" stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M12.5 11l15 8v5" fill="none" stroke={p.soft} strokeWidth={3.5} strokeLinejoin="round" />
      <Tag x={23} y={28} p={p} />
    </G>
  );
}

/** An empty label drawn dashed, with a cyan plus: start from nothing. */
function BlankArt({ p }: { p: Palette }) {
  return (
    <G>
      <Rect x={5} y={7} width={30} height={23} rx={4} fill={p.paper} stroke={p.ink} strokeWidth={2} strokeDasharray="4 3" />
      <Circle cx={31} cy={32} r={9} fill={p.tag} stroke={p.ink} strokeWidth={2} />
      <Path d="M31 27.5v9M26.5 32h9" stroke={TAG_TEXT} strokeWidth={2.2} strokeLinecap="round" />
    </G>
  );
}

/** Two ready-made label cards, the front one with a cyan header and a barcode. */
function TemplateArt({ p }: { p: Palette }) {
  return (
    <G>
      <Rect x={13} y={4} width={27} height={21} rx={3.5} fill={p.soft} stroke={p.ink} strokeOpacity={0.45} strokeWidth={2} />
      <Rect x={5} y={12} width={29} height={27} rx={3.5} fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <Path d="M6 19v-3.5A2.5 2.5 0 0 1 8.5 13h22a2.5 2.5 0 0 1 2.5 2.5V19z" fill={p.tag} />
      <Path d="M10 24.5h13M10 28.5h8" stroke={p.ink} strokeOpacity={0.45} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M10 32v4M12.5 32v4M15.5 32v4M17.5 32v4M20.5 32v4M23 32v4M26 32v4M28.5 32v4" stroke={p.ink} strokeWidth={1.4} />
    </G>
  );
}

/** A picture (hills and sun) with an upload arrow, landing as a tag. */
function UploadImageArt({ p }: { p: Palette }) {
  return (
    <G>
      <Rect x={4} y={8} width={31} height={25} rx={3.5} fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <Path d="M6 29.5l8-8.5 6 6 4-4 9 9" fill="none" stroke={p.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={12.5} cy={15} r={3} fill={SUN} />
      <Circle cx={33} cy={10} r={7} fill={p.tag} stroke={p.ink} strokeWidth={2} />
      <Path d="M33 13.5v-7M30 9.2L33 6.2l3 3" fill="none" stroke={TAG_TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Tag x={23} y={28} p={p} />
    </G>
  );
}

/** A .seznik file: a page with the folded corner and the logo swoosh on it. */
function SeznikFile({ p, id }: { p: Palette; id: string }) {
  return (
    <G>
      <Defs>
        <LinearGradient id={id} x1="0.3" y1="0" x2="0.7" y2="1">
          <Stop offset="0" stopColor={LOGO_CYAN} />
          <Stop offset="0.55" stopColor={LOGO_BLUE} />
          <Stop offset="1" stopColor={LOGO_NAVY} />
        </LinearGradient>
      </Defs>
      <Path d="M9 5h17l9 9v22a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill={p.paper} stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M26 5v6.5a2.5 2.5 0 0 0 2.5 2.5H35" fill={p.soft} stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />
      <Path d={LOGO_SWOOSH} fill={`url(#${id})`} transform="translate(8 14) scale(0.86)" />
    </G>
  );
}

/** A .seznik file with a cyan arrow coming in: open one shared with you. */
function ImportArt({ p }: { p: Palette }) {
  return (
    <G>
      <SeznikFile p={p} id="seznik-import" />
      <Circle cx={35} cy={35} r={7.5} fill={p.tag} stroke={p.ink} strokeWidth={2} />
      <Path d="M35 31v7.5M32 35.5l3 3 3-3" fill="none" stroke={TAG_TEXT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

/** The .seznik file mark on its own, like the Excel and PDF marks, for anywhere a label file is shown. */
export function SeznikFileMark({ size = 46 }: { size?: number }) {
  useThemeRefresh();
  const p: Palette = { ink: C.brandInk, paper: C.surface, soft: C.accentSoft, tag: C.accent };
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46" accessibilityElementsHidden importantForAccessibility="no">
      <SeznikFile p={p} id="seznik-file" />
    </Svg>
  );
}

/** The four ways into a new label, in the same drawn family as the home tiles. */
export type NewLabelArtKind = 'blank' | 'template' | 'upload' | 'import';

const NEW_LABEL_ART: Record<NewLabelArtKind, (props: { p: Palette }) => React.JSX.Element> = {
  blank: BlankArt,
  template: TemplateArt,
  upload: UploadImageArt,
  import: ImportArt,
};

export function NewLabelArt({ kind, size = 46 }: { kind: NewLabelArtKind; size?: number }) {
  useThemeRefresh();
  const Art = NEW_LABEL_ART[kind];
  const p: Palette = { ink: C.brandInk, paper: C.surface, soft: C.accentSoft, tag: C.accent };
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46" accessibilityElementsHidden importantForAccessibility="no">
      <Art p={p} />
    </Svg>
  );
}

const ART: Partial<Record<HomeToolId, (props: { p: Palette }) => React.JSX.Element>> = {
  excel: ExcelArt,
  pdf: PdfArt,
  importLabel: ImportArt,
  imageToLabel: UploadArt,
  serialLabels: SerialArt,
  shippingLabels: ShippingArt,
};

export function hasToolArt(id: HomeToolId): boolean {
  return ART[id] != null;
}

export function ToolArt({ id, size = 46 }: { id: HomeToolId; size?: number }) {
  useThemeRefresh();
  const Art = ART[id];
  if (!Art) return null;
  const p: Palette = { ink: C.brandInk, paper: C.surface, soft: C.accentSoft, tag: C.accent };
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46" accessibilityElementsHidden importantForAccessibility="no">
      <Art p={p} />
    </Svg>
  );
}
