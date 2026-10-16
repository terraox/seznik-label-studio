/**
 * Dedicated finger-sized editing pad.
 * Mutates millimetre canvas state through parent callbacks — never screen pixels.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';

import { NUDGE_FAST_MM, NUDGE_FINE_MM, NUDGE_NORMAL_MM } from '@/lib/editor/engine';
import { formatViewZoomLabel } from '@/lib/label-geometry';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type EditingPadProps = {
  enabled: boolean;
  locked: boolean;
  hidden: boolean;
  canPaste: boolean;
  viewZoom: number;
  onNudge: (dxMm: number, dyMm: number) => void;
  onRotate: (deltaDeg: number) => void;
  onAlign: (kind: 'left' | 'right' | 'top' | 'bottom' | 'center') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLock: () => void;
  onHide: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFront: () => void;
  onBack: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

const HOLD_MS = 280;
const REPEAT_MS = 70;

function PadBtn({
  icon,
  label,
  onPress,
  onHold,
  disabled,
  active,
}: {
  icon?: AppIconName;
  label?: string;
  onPress: () => void;
  onHold?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  useThemeRefresh();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    holdTimer.current = null;
    repeatTimer.current = null;
  };

  useEffect(() => clear, []);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        if (!onHold || disabled) return;
        holdTimer.current = setTimeout(() => {
          repeatTimer.current = setInterval(onHold, REPEAT_MS);
        }, HOLD_MS);
      }}
      onPressOut={clear}
      hitSlop={10}
      style={({ pressed }) => [
        styles.btn,
        active && styles.btnActive,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      {icon ? (
        <AppIcon name={icon} tintColor={disabled ? C.textDisabled : C.text} size={18} />
      ) : (
        <Text style={[styles.btnGlyph, disabled && styles.btnGlyphDisabled]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function EditingPad({
  enabled,
  locked,
  hidden,
  canPaste,
  viewZoom,
  onNudge,
  onRotate,
  onAlign,
  onDuplicate,
  onDelete,
  onLock,
  onHide,
  onCopy,
  onPaste,
  onFront,
  onBack,
  onZoomIn,
  onZoomOut,
}: EditingPadProps) {
  useThemeRefresh();
  const [fine, setFine] = useState(false);
  const step = fine ? NUDGE_FINE_MM : NUDGE_NORMAL_MM;
  const holdStep = fine ? NUDGE_NORMAL_MM : NUDGE_FAST_MM;
  const moveDisabled = !enabled || locked;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.row}>
        <View style={styles.dpad}>
          <PadBtn
            icon="arrowtriangle.up.fill"
            disabled={moveDisabled}
            onPress={() => onNudge(0, -step)}
            onHold={() => onNudge(0, -holdStep)}
          />
          <View style={styles.dpadMid}>
            <PadBtn
              icon="arrowtriangle.left.fill"
              disabled={moveDisabled}
              onPress={() => onNudge(-step, 0)}
              onHold={() => onNudge(-holdStep, 0)}
            />
            <PadBtn
              icon="align.horizontal.center"
              disabled={!enabled || locked}
              onPress={() => onAlign('center')}
            />
            <PadBtn
              icon="arrowtriangle.right.fill"
              disabled={moveDisabled}
              onPress={() => onNudge(step, 0)}
              onHold={() => onNudge(holdStep, 0)}
            />
          </View>
          <PadBtn
            icon="arrowtriangle.down.fill"
            disabled={moveDisabled}
            onPress={() => onNudge(0, step)}
            onHold={() => onNudge(0, holdStep)}
          />
        </View>

        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <PadBtn icon="arrow.counterclockwise" disabled={!enabled || locked} onPress={() => onRotate(-15)} />
            <PadBtn icon="arrow.clockwise" disabled={!enabled || locked} onPress={() => onRotate(15)} />
            <PadBtn icon="square.on.square" disabled={!enabled} onPress={onDuplicate} />
            <PadBtn icon="trash" disabled={!enabled} onPress={onDelete} />
          </View>
          <View style={styles.actionRow}>
            <PadBtn icon={locked ? 'lock.open' : 'lock'} disabled={!enabled} onPress={onLock} />
            <PadBtn icon={hidden ? 'eye' : 'eye.slash'} disabled={!enabled} onPress={onHide} />
            <PadBtn label="C" disabled={!enabled} onPress={onCopy} />
            <PadBtn label="P" disabled={!canPaste} onPress={onPaste} />
          </View>
          <View style={styles.actionRow}>
            <PadBtn label="F" disabled={!enabled} onPress={onFront} />
            <PadBtn label="B" disabled={!enabled} onPress={onBack} />
            <PadBtn
              label={fine ? '0.2' : '0.5'}
              active={fine}
              onPress={() => setFine((v) => !v)}
            />
            <View style={styles.zoomCluster}>
              <PadBtn label="−" onPress={onZoomOut} />
              <Text style={styles.zoomLabel}>{formatViewZoomLabel(viewZoom)}</Text>
              <PadBtn label="+" onPress={onZoomIn} />
            </View>
          </View>
        </View>
      </View>
      <Text style={styles.hint}>
        {fine ? 'Fine 0.2 mm' : 'Move 0.5 mm'} · hold for faster · zoom is view only
      </Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: {
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dpad: {
    alignItems: 'center',
    gap: 4,
  },
  dpadMid: {
    flexDirection: 'row',
    gap: 4,
  },
  actions: {
    flex: 1,
    gap: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: c.fillStrong,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnGlyph: {
    color: c.text,
    fontSize: 13,
    fontWeight: '700',
  },
  btnGlyphDisabled: {
    color: c.textMuted,
  },
  zoomCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoomLabel: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    color: c.text,
  },
  hint: {
    marginTop: 4,
    fontSize: 10,
    color: c.textMuted,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.72,
  },
}));
