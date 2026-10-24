import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import {
  AlignBottomIcon,
  AlignHorizontalCenterIcon,
  AlignObjectCenterHIcon,
  AlignObjectLeftIcon,
  AlignObjectRightIcon,
  AlignTopIcon,
  AlignVerticalCenterIcon,
  CenterCheckIcon,
  FitToCanvasIcon,
  NudgeDownIcon,
  NudgeLeftIcon,
  NudgeRightIcon,
  NudgeUpIcon,
  StretchHorizontalIcon,
  StretchVerticalIcon,
} from '@/components/editor/position-icons';
import type { TextAlign } from '@/components/editor/types';
import type { MemberAlignKind } from '@/lib/editor/selection';
import { themedStyles, useThemeRefresh } from '@/theme';

const NUDGE_MM = 0.5;
const PRESS_HIT_SLOP = 10;

export type PositionLayerActions = {
  /** How many canvas elements are currently selected (gates multi-align). */
  selectedCount?: number;
  /** Align selected members to each other — only meaningful with 2+ selection. */
  onAlignMembers?: (kind: MemberAlignKind) => void;
  /** Distribute selected members along an axis — only meaningful with 2+ selection. */
  onDistributeMembers?: (axis: 'h' | 'v') => void;
};

const PositionLayerActionsContext = createContext<PositionLayerActions | undefined>(undefined);

export function PositionLayerActionsProvider({
  value,
  children,
}: {
  value: PositionLayerActions;
  children: ReactNode;
}) {
  useThemeRefresh();
  return (
    <PositionLayerActionsContext.Provider value={value}>{children}</PositionLayerActionsContext.Provider>
  );
}

export type PositionControlsProps = {
  left: number;
  top: number;
  width: number;
  height: number;
  labelWidthMm: number;
  labelHeightMm: number;
  onPatch: (updates: Record<string, number | string>) => void;
  /** When provided, horizontal-align buttons also update the text align property. */
  textAlign?: TextAlign;
  layerActions?: PositionLayerActions;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function PositionControls({
  left,
  top,
  width,
  height,
  labelWidthMm,
  labelHeightMm,
  onPatch,
  textAlign,
  layerActions: layerActionsProp,
}: PositionControlsProps) {
  useThemeRefresh();
  const layerActionsFromContext = useContext(PositionLayerActionsContext);
  const layerActions = layerActionsProp ?? layerActionsFromContext;
  const selectedCount = layerActions?.selectedCount ?? 1;
  const multiAlignEnabled = selectedCount >= 2;
  const maxLeft = Math.max(0, labelWidthMm - width);
  const maxTop = Math.max(0, labelHeightMm - height);

  const nudge = (dx: number, dy: number) => {
    onPatch({
      left: clamp(left + dx, 0, maxLeft),
      top: clamp(top + dy, 0, maxTop),
    });
  };

  const centerOnLabel = () => {
    onPatch({
      left: clamp((labelWidthMm - width) / 2, 0, maxLeft),
      top: clamp((labelHeightMm - height) / 2, 0, maxTop),
    });
  };

  const centerVerticalOnLabel = () => {
    onPatch({ top: clamp((labelHeightMm - height) / 2, 0, maxTop) });
  };

  const centerHorizontalOnLabel = () => {
    onPatch({
      left: clamp((labelWidthMm - width) / 2, 0, maxLeft),
      ...(textAlign !== undefined ? { align: 'center' as TextAlign } : {}),
    });
  };

  const fitToCanvas = () => {
    onPatch({
      left: 0,
      top: 0,
      width: labelWidthMm,
      height: labelHeightMm,
      ...(textAlign !== undefined ? { align: 'spacing' as TextAlign } : {}),
    });
  };

  const alignMembers = (kind: MemberAlignKind) => {
    if (!multiAlignEnabled) return;
    layerActions?.onAlignMembers?.(kind);
  };

  const distribute = (axis: 'h' | 'v') => {
    if (!multiAlignEnabled) return;
    layerActions?.onDistributeMembers?.(axis);
  };

  const padBtn = (icon: ReactNode, onPress: () => void, label: string) => (
    <Pressable
      onPress={onPress}
      hitSlop={PRESS_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.padBtn, pressed && styles.pressed]}>
      {icon}
    </Pressable>
  );

  const gridBtn = (
    icon: ReactNode,
    onPress: (() => void) | undefined,
    label: string,
    enabled = true,
  ) => (
    <Pressable
      disabled={!enabled || !onPress}
      onPress={onPress}
      hitSlop={PRESS_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled || !onPress }}
      style={({ pressed }) => [
        styles.gridBtn,
        (!enabled || !onPress) && styles.btnDisabled,
        pressed && enabled && onPress && styles.pressed,
      ]}>
      {icon}
    </Pressable>
  );

  return (
    <View style={styles.positionWrap}>
      <View style={styles.padColumn}>
        {padBtn(<NudgeUpIcon />, () => nudge(0, -NUDGE_MM), 'Nudge up')}
        <View style={styles.padMiddleRow}>
          {padBtn(<NudgeLeftIcon />, () => nudge(-NUDGE_MM, 0), 'Nudge left')}
          <Pressable
            onPress={centerOnLabel}
            hitSlop={PRESS_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Center on label"
            style={({ pressed }) => [styles.padBtn, styles.padCenter, pressed && styles.pressed]}>
            <CenterCheckIcon />
          </Pressable>
          {padBtn(<NudgeRightIcon />, () => nudge(NUDGE_MM, 0), 'Nudge right')}
        </View>
        {padBtn(<NudgeDownIcon />, () => nudge(0, NUDGE_MM), 'Nudge down')}
      </View>

      <View style={styles.alignGrid}>
        {/* Row 1 — always: center on label / fit */}
        <View style={styles.alignRow}>
          {gridBtn(<AlignVerticalCenterIcon />, centerVerticalOnLabel, 'Center vertically on label')}
          {gridBtn(<AlignHorizontalCenterIcon />, centerHorizontalOnLabel, 'Center horizontally on label')}
          {gridBtn(<FitToCanvasIcon />, fitToCanvas, 'Fit to label')}
        </View>
        {/* Rows 2–3 — multi-select only: align / distribute members */}
        <View style={styles.alignRow}>
          {gridBtn(
            <AlignObjectLeftIcon />,
            () => alignMembers('left'),
            'Align left edges',
            multiAlignEnabled,
          )}
          {gridBtn(
            <AlignObjectCenterHIcon />,
            () => alignMembers('center-h'),
            'Align horizontal centers',
            multiAlignEnabled,
          )}
          {gridBtn(
            <AlignObjectRightIcon />,
            () => alignMembers('right'),
            'Align right edges',
            multiAlignEnabled,
          )}
          {gridBtn(
            <StretchHorizontalIcon />,
            () => distribute('h'),
            'Distribute horizontally',
            multiAlignEnabled,
          )}
        </View>
        <View style={styles.alignRow}>
          {gridBtn(<AlignTopIcon />, () => alignMembers('top'), 'Align top edges', multiAlignEnabled)}
          {gridBtn(
            <AlignVerticalCenterIcon />,
            () => alignMembers('center-v'),
            'Align vertical centers',
            multiAlignEnabled,
          )}
          {gridBtn(
            <AlignBottomIcon />,
            () => alignMembers('bottom'),
            'Align bottom edges',
            multiAlignEnabled,
          )}
          {gridBtn(
            <StretchVerticalIcon />,
            () => distribute('v'),
            'Distribute vertically',
            multiAlignEnabled,
          )}
        </View>
      </View>
    </View>
  );
}

const BTN = {
  size: 44,
  radius: 6,
  gap: 6,
} as const;

const styles = themedStyles((c) => ({
  pressed: { opacity: 0.72 },
  positionWrap: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },
  padColumn: { alignItems: 'center', gap: BTN.gap },
  padMiddleRow: { flexDirection: 'row', gap: BTN.gap },
  padBtn: {
    width: BTN.size,
    height: BTN.size,
    borderRadius: BTN.radius,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padCenter: { backgroundColor: c.fillStrong },
  alignGrid: { flex: 1, gap: BTN.gap },
  alignRow: { flexDirection: 'row', gap: BTN.gap },
  gridBtn: {
    flex: 1,
    height: BTN.size,
    borderRadius: BTN.radius,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.35 },
}));
