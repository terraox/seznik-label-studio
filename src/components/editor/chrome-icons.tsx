import Svg, { Path, Rect } from 'react-native-svg';
import { C, useThemeRefresh } from '@/theme';

const SHIELD = 'M12 2.5 L19.5 5.4 V11 C19.5 15.9 16.4 19.8 12 21.5 C7.6 19.8 4.5 15.9 4.5 11 V5.4 Z';

/** Shield: filled with a check when on, empty outline when off. */
export function SafeModeIcon({ active, color, size = 18 }: { active: boolean; color: string; size?: number }) {
  useThemeRefresh();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={SHIELD}
        fill={active ? color : 'none'}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {active ? (
        <Path
          d="M8.4 11.8 L11 14.4 L15.8 9.4"
          fill="none"
          stroke={C.onAccent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

/** Printed sheet with a grid: filled with white rules when on, outline when off. */
/** Calibration ruler: tick marks when on, plain ruler when off. */
export function PrintRulerIcon({ active, color, size = 18 }: { active: boolean; color: string; size?: number }) {
  useThemeRefresh();
  const ink = active ? '#FFFFFF' : color; // theme-fixed: white on active accent
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.5 18.5 H19.5 A1.5 1.5 0 0 0 21 17 V7 A1.5 1.5 0 0 0 19.5 5.5 H4.5 A1.5 1.5 0 0 0 3 7 V17 A1.5 1.5 0 0 0 4.5 18.5 Z"
        fill={active ? color : 'none'}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M7.2 14.2 V18 M10.2 12.2 V18 M13.2 10.2 V18 M16.2 14.2 V18"
        stroke={ink}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PrintGridIcon({ active, color, size = 18 }: { active: boolean; color: string; size?: number }) {
  useThemeRefresh();
  const rule = active ? '#FFFFFF' : color; // theme-fixed: white on active accent
  // A label sheet with a dashed grid and four corner ticks: "the grid that gets printed".
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect
        x={3.5}
        y={3.5}
        width={17}
        height={17}
        rx={2.5}
        fill={active ? color : 'none'}
        stroke={color}
        strokeWidth={1.8}
      />
      <Path
        d="M9.2 3.5 V20.5 M14.8 3.5 V20.5 M3.5 9.2 H20.5 M3.5 14.8 H20.5"
        stroke={rule}
        strokeWidth={1.2}
        strokeDasharray="1.6 1.6"
        strokeLinecap="round"
      />
    </Svg>
  );
}
