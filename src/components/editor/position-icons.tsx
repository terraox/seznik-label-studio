import Svg, { Line, Path, Rect } from 'react-native-svg';
import type { ReactNode } from 'react';
import { C, useThemeRefresh } from '@/theme';

type IconProps = { size?: number; color?: string };

const DEFAULT_SIZE = 22;

function SvgWrap({ size, children }: { size: number; children: ReactNode }) {
  useThemeRefresh();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

/** Filled triangle pointing up — nudge north. */
export function NudgeUpIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Path d="M12 5 L18 15 H6 Z" fill={color} />
    </SvgWrap>
  );
}

/** Filled triangle pointing down — nudge south. */
export function NudgeDownIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Path d="M12 19 L6 9 H18 Z" fill={color} />
    </SvgWrap>
  );
}

/** Filled triangle pointing left — nudge west. */
export function NudgeLeftIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Path d="M5 12 L15 6 V18 Z" fill={color} />
    </SvgWrap>
  );
}

/** Filled triangle pointing right — nudge east. */
export function NudgeRightIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Path d="M19 12 L9 6 V18 Z" fill={color} />
    </SvgWrap>
  );
}

/** D-pad center: checkmark — center element on the label. */
export function CenterCheckIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Path
        d="M5 12.5 L10 17.5 L19 7"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </SvgWrap>
  );
}

/** Center vertically on label (box on horizontal midline). */
export function AlignVerticalCenterIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Rect x="9" y="8" width="6" height="8" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
    </SvgWrap>
  );
}

/** Center horizontally on label (box on vertical midline). */
export function AlignHorizontalCenterIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Rect x="8" y="9" width="8" height="6" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
    </SvgWrap>
  );
}

/** Fit element to full label (corner brackets). */
export function FitToCanvasIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Path
        d="M5 9 V5 H9 M15 5 H19 V9 M19 15 V19 H15 M9 19 H5 V15"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Rect x="8.5" y="8.5" width="7" height="7" rx="1" stroke={color} strokeWidth="1.6" fill="none" />
    </SvgWrap>
  );
}

/** Align object left edge to label. */
export function AlignObjectLeftIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Line x1="5" y1="4" x2="5" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Rect x="7.5" y="8.5" width="8" height="7" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
    </SvgWrap>
  );
}

/** Align object horizontal center. */
export function AlignObjectCenterHIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Rect x="8" y="8.5" width="8" height="7" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
    </SvgWrap>
  );
}

/** Align object right edge to label. */
export function AlignObjectRightIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Line x1="19" y1="4" x2="19" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Rect x="8.5" y="8.5" width="8" height="7" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
    </SvgWrap>
  );
}

/** Distribute / stretch horizontally (arrows out from a box). */
export function StretchHorizontalIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Rect x="8" y="8" width="8" height="8" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
      <Path
        d="M3 12 H7 M17 12 H21 M5.2 9.5 L3 12 L5.2 14.5 M18.8 9.5 L21 12 L18.8 14.5"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </SvgWrap>
  );
}

/** Align object top edge. */
export function AlignTopIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Line x1="4" y1="5" x2="20" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Rect x="8.5" y="7.5" width="7" height="8" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
    </SvgWrap>
  );
}

/** Align object bottom edge. */
export function AlignBottomIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Line x1="4" y1="19" x2="20" y2="19" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Rect x="8.5" y="8.5" width="7" height="8" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
    </SvgWrap>
  );
}

/** Distribute / stretch vertically (arrows out from a box). */
export function StretchVerticalIcon({ size = DEFAULT_SIZE, color = C.textSecondary }: IconProps) {
  useThemeRefresh();
  return (
    <SvgWrap size={size}>
      <Rect x="8" y="8" width="8" height="8" rx="1" stroke={color} strokeWidth="1.8" fill="none" />
      <Path
        d="M12 3 V7 M12 17 V21 M9.5 5.2 L12 3 L14.5 5.2 M9.5 18.8 L12 21 L14.5 18.8"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </SvgWrap>
  );
}
