import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BORDER_LIBRARY } from '@/constants/border-library';
import { borderBoxForCenterGap } from '@/lib/border-geometry';
import type { BorderElementState } from '@/lib/label-document';
import {
  JOSH_BORDER_GAP_MAX_MM,
  JOSH_BORDER_GAP_MIN_MM,
  joshBorderGapMm,
} from '@/lib/printer/josh-print';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import {
  TD404_BORDER_GAP_MAX_MM,
  TD404_BORDER_GAP_MIN_MM,
  td404BorderGapMm,
} from '@/lib/printer/print-spec';
import { themedStyles, useThemeRefresh } from '@/theme';

const LINE_MIN = 0.1;
const LINE_MAX = 1.5;

type BorderPropertyPanelProps = {
  state: BorderElementState & { id: string };
  patch: (updates: Record<string, unknown>) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  onChangeStyle: () => void;
  onRemove: () => void;
};

export function BorderPropertyPanel({
  state,
  patch,
  labelWidthMm,
  labelHeightMm,
  onChangeStyle,
  onRemove,
}: BorderPropertyPanelProps) {
  useThemeRefresh();
  const usesTd404 = getPrinterManager().usesTd404CommandSet;
  const gapMin = usesTd404 ? TD404_BORDER_GAP_MIN_MM : JOSH_BORDER_GAP_MIN_MM;
  const gapMax = usesTd404 ? TD404_BORDER_GAP_MAX_MM : JOSH_BORDER_GAP_MAX_MM;
  const clampGap = usesTd404 ? td404BorderGapMm : joshBorderGapMm;
  const gap = clampGap(state.edgeGapMm);
  const styleName = BORDER_LIBRARY.find((item) => item.id === state.borderStyle)?.name ?? 'Border';
  const trackWidth = useRef(1);
  const [gapText, setGapText] = useState(String(gap));
  const [gapSource, setGapSource] = useState(gap);
  if (gapSource !== gap) {
    setGapSource(gap);
    setGapText(String(gap));
  }

  const lineWidth = Math.min(LINE_MAX, Math.max(LINE_MIN, state.lineWidth || LINE_MIN));
  const ratio = (lineWidth - LINE_MIN) / (LINE_MAX - LINE_MIN);

  const commit = (nextWidth: number, nextGap: number) => {
    const width = Math.round(Math.min(LINE_MAX, Math.max(LINE_MIN, nextWidth)) * 100) / 100;
    const edgeGapMm = clampGap(nextGap);
    patch({
      lineWidth: width,
      edgeGapMm,
      geometryVersion: 1,
      ...borderBoxForCenterGap(labelWidthMm, labelHeightMm, edgeGapMm, width),
    });
  };

  const setLineFromX = (x: number) => {
    const nextRatio = Math.min(1, Math.max(0, x / trackWidth.current));
    commit(LINE_MIN + nextRatio * (LINE_MAX - LINE_MIN), gap);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Border</Text>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue} numberOfLines={1}>
            {styleName}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.block}>
        <View style={styles.blockHeader}>
          <Text style={styles.rowLabel}>Line width</Text>
          <Text style={styles.rowValue}>{lineWidth.toFixed(2)} mm</Text>
        </View>
        <View style={styles.rangeLabels}>
          <Text style={styles.rangeText}>{LINE_MIN.toFixed(1)}</Text>
          <Text style={styles.rangeText}>{LINE_MAX.toFixed(1)}</Text>
        </View>
        <View
          style={styles.sliderHit}
          onLayout={(event) => {
            trackWidth.current = event.nativeEvent.layout.width || 1;
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) => setLineFromX(event.nativeEvent.locationX)}
          onResponderMove={(event) => setLineFromX(event.nativeEvent.locationX)}>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} />
          </View>
          <View style={[styles.sliderThumb, { left: `${ratio * 100}%` }]} />
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.gapRow}>
        <Text style={styles.rowLabel}>
          Distance from edge (mm, {gapMin}–{gapMax})
        </Text>
        <TextInput
          style={styles.gapInput}
          value={gapText}
          keyboardType="decimal-pad"
          selectTextOnFocus
          onChangeText={(text) => {
            setGapText(text);
            const value = parseFloat(text.replace(',', '.'));
            if (Number.isFinite(value)) commit(lineWidth, value);
          }}
          onBlur={() => {
            const next = clampGap(parseFloat(gapText.replace(',', '.')));
            setGapText(String(next));
            commit(lineWidth, next);
          }}
        />
      </View>
      <View style={styles.actionRow}>
        <Pressable onPress={onChangeStyle} style={({ pressed }) => [styles.replaceBtn, pressed && styles.pressed]}>
          <Text style={styles.replaceText}>Replace border</Text>
        </Pressable>
        <Pressable onPress={onRemove} style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.removeText}>Cancel border</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  panel: {
    paddingBottom: 8,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  rowLabel: {
    fontSize: 15,
    color: c.textSecondary,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: c.accent,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    marginLeft: 16,
  },
  block: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rangeLabels: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rangeText: {
    fontSize: 12,
    color: c.textMuted,
  },
  sliderHit: {
    marginTop: 6,
    height: 28,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: c.fillStrong,
    overflow: 'hidden',
  },
  sliderFill: {
    height: 4,
    backgroundColor: c.accent,
  },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  gapRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  gapInput: {
    width: 72,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 15,
    color: c.textSecondary,
  },
  actionRow: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: 'row',
    gap: 12,
  },
  replaceBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.accent,
    paddingVertical: 12,
    alignItems: 'center',
  },
  replaceText: {
    color: c.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.danger,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeText: {
    color: c.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
}));
