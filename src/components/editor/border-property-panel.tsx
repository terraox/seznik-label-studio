import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
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

const ACCENT = '#48C3C7';
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
      <Pressable onPress={onChangeStyle} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Text style={styles.rowLabel}>Border</Text>
        <View style={styles.rowRight}>
          <Text style={styles.rowValue} numberOfLines={1}>
            {styleName}
          </Text>
          <AppIcon name="chevron.right" tintColor="#B8C0C8" size={14} weight="semibold" />
        </View>
      </Pressable>
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
      <Pressable onPress={onRemove} style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
        <Text style={styles.removeText}>Remove border</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: '#2C3E50',
    flexShrink: 1,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: ACCENT,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E4E8ED',
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
    color: '#8A97A4',
  },
  sliderHit: {
    marginTop: 6,
    height: 28,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D7DDE3',
    overflow: 'hidden',
  },
  sliderFill: {
    height: 4,
    backgroundColor: ACCENT,
  },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    borderColor: '#D7DDE3',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 15,
    color: '#2C3E50',
  },
  removeBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E25B5B',
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeText: {
    color: '#E25B5B',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
