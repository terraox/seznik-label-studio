import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

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

function PhotoArt({ p }: { p: Palette }) {
  return (
    <G>
      <Rect x={4} y={6} width={31} height={25} rx={3.5} fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <Path d="M6 27.5l8-8.5 6 6 4-4 9 9" fill="none" stroke={p.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={26.5} cy={13.5} r={3} fill={SUN} />
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

const ART: Partial<Record<HomeToolId, (props: { p: Palette }) => React.JSX.Element>> = {
  excel: ExcelArt,
  pdf: PdfArt,
  photo: PhotoArt,
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
