import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { TextInput } from '@/components/ui/text-input';

import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';
import {
  ninePointToOffsetNorm,
  parsePageRange,
  tiledRepeatCount,
  type NinePoint,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { themedStyles, useThemeRefresh } from '@/theme';

const WORD_PRESETS = ['CONFIDENTIAL', 'DRAFT', 'SAMPLE', 'PAID', 'COPY', 'URGENT'];

const COLOR_PRESETS = [
  { label: 'Red', hex: '#DC2626' }, // theme-fixed: watermark ink choice (printed)
  { label: 'Crimson', hex: '#991B1B' }, // theme-fixed: watermark ink choice (printed)
  { label: 'Slate', hex: '#374151' }, // theme-fixed: watermark ink choice (printed)
  { label: 'Ink', hex: '#111827' }, // theme-fixed: watermark ink choice (printed)
  { label: 'Blue', hex: '#2563EB' }, // theme-fixed: watermark ink choice (printed)
  { label: 'Green', hex: '#059669' }, // theme-fixed: watermark ink choice (printed)
  { label: 'Gold', hex: '#D97706' }, // theme-fixed: watermark ink choice (printed)
  { label: 'Purple', hex: '#7C3AED' }, // theme-fixed: watermark ink choice (printed)
];

const ANCHOR_GRID: NinePoint[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

const ANCHOR_LABEL: Record<NinePoint, string> = {
  'top-left': 'Top left',
  'top-center': 'Top',
  center: 'Center',
  'top-right': 'Top right',
  'middle-left': 'Left',
  'middle-right': 'Right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom',
  'bottom-right': 'Bottom right',
};

const THUMB = 22;

function snap(raw: number, min: number, max: number, step: number) {
  const steps = Math.round((raw - min) / step);
  const next = min + steps * step;
  const digits = step < 1 ? 2 : 0;
  return Math.min(max, Math.max(min, Number(next.toFixed(digits))));
}

export function PdfWatermarkTool({
  value,
  pageCount,
  onChange,
  onPickImage,
}: {
  value: PdfWatermark;
  pageCount: number;
  onChange: (next: PdfWatermark) => void;
  onPickImage: (uri: string) => void;
}) {
  useThemeRefresh();
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();
  const rangeError =
    value.scope.mode === 'range'
      ? parsePageRange(String(value.scope.start), String(value.scope.end), pageCount).error
      : undefined;

  const pick = async () => {
    const asset = await pickImageAsset();
    if (!asset) return;
    onPickImage(asset.uri);
  };

  const setAnchor = (anchor: NinePoint) => {
    onChange({
      ...value,
      stamp: {
        anchor,
        offsetNorm: ninePointToOffsetNorm(anchor),
        sizeNorm: value.stamp?.sizeNorm ?? 0.42,
      },
    });
  };

  const currentColor = value.text?.color || '#DC2626'; // theme-fixed: watermark ink (printed)
  const currentSpacing = value.tiled?.spacingNorm ?? { x: 0.24, y: 0.24 };
  const gridInfo = tiledRepeatCount(currentSpacing);
  const currentFontSize = value.text?.fontSizePt ?? 22;
  const isStaggered = value.tiled?.staggered ?? true;
  const stampSize = value.stamp?.sizeNorm ?? 0.42;

  const setText = (patch: Partial<NonNullable<PdfWatermark['text']>>) => {
    onChange({
      ...value,
      text: {
        content: value.text?.content || 'WATERMARK',
        fontSizePt: currentFontSize,
        color: currentColor,
        ...patch,
      },
    });
  };

  return (
    <View style={styles.wrap}>
      <Segmented
        value={value.layout}
        options={[
          { id: 'stamp', label: 'Stamp' },
          { id: 'tiled', label: 'Tiled' },
        ]}
        onChange={(layout) => {
          if (layout === 'stamp') {
            onChange({
              ...value,
              layout,
              stamp: value.stamp ?? { anchor: 'center', offsetNorm: { x: 0.5, y: 0.5 }, sizeNorm: 0.42 },
            });
            return;
          }
          onChange({
            ...value,
            layout,
            tiled: value.tiled ?? { spacingNorm: { x: 0.24, y: 0.24 }, staggered: true },
          });
        }}
      />
      <Segmented
        value={value.type}
        options={[
          { id: 'text', label: 'Text' },
          { id: 'image', label: 'Image' },
        ]}
        onChange={(type) => onChange({ ...value, type })}
      />

      {value.type === 'text' ? (
        <View style={styles.block}>
          <TextInput
            value={value.text?.content ?? ''}
            onChangeText={(content) => setText({ content })}
            placeholder="Watermark text"
            style={styles.input}
          />
          <View style={styles.chips}>
            {WORD_PRESETS.map((word) => {
              const active = value.text?.content === word;
              return (
                <Pressable
                  key={word}
                  onPress={() => setText({ content: word })}
                  style={[styles.chip, active && styles.chipOn]}>
                  <Text style={[styles.chipText, active && styles.chipTextOn]}>{word}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.kicker}>Color</Text>
          <View style={styles.swatches}>
            {COLOR_PRESETS.map((c) => {
              const active = currentColor === c.hex;
              return (
                <Pressable
                  key={c.hex}
                  accessibilityLabel={c.label}
                  onPress={() => setText({ color: c.hex })}
                  style={[styles.swatch, active && styles.swatchOn]}>
                  <View style={[styles.swatchDot, { backgroundColor: c.hex }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <Pressable onPress={pick} style={styles.imageBtn}>
          <Text style={styles.imageTitle}>{value.image?.sourceUri ? 'Replace image' : 'Choose image'}</Text>
          <Text style={styles.imageHint}>PNG or JPG. It prints at the opacity below.</Text>
        </Pressable>
      )}

      {value.layout === 'stamp' ? (
        <View style={styles.block}>
          <View style={styles.placeRow}>
            <View style={styles.placeCopy}>
              <Text style={styles.kicker}>Position</Text>
              <Text style={styles.placeValue}>{ANCHOR_LABEL[value.stamp?.anchor ?? 'center']}</Text>
              <Text style={styles.hint}>Drag the mark on the page, or tap a point.</Text>
            </View>
            <View style={styles.anchor}>
              {ANCHOR_GRID.map((id) => {
                const active = (value.stamp?.anchor ?? 'center') === id;
                return (
                  <Pressable
                    key={id}
                    accessibilityLabel={ANCHOR_LABEL[id]}
                    onPress={() => setAnchor(id)}
                    style={[styles.anchorCell, active && styles.anchorCellOn]}>
                    <View style={[styles.anchorDot, active && styles.anchorDotOn]} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Meter
            label="Size"
            valueLabel={`${Math.round(stampSize * 100)}%`}
            value={stampSize}
            min={0.15}
            max={0.9}
            step={0.01}
            onChange={(sizeNorm) =>
              onChange({
                ...value,
                stamp: {
                  anchor: value.stamp?.anchor ?? 'center',
                  offsetNorm: value.stamp?.offsetNorm ?? { x: 0.5, y: 0.5 },
                  sizeNorm,
                },
              })
            }
          />
        </View>
      ) : (
        <View style={styles.block}>
          <Meter
            label="Spacing"
            valueLabel={`${gridInfo.cols} × ${gridInfo.rows}`}
            value={currentSpacing.x}
            min={0.1}
            max={0.5}
            step={0.01}
            onChange={(spacing) =>
              onChange({
                ...value,
                tiled: { spacingNorm: { x: spacing, y: spacing }, staggered: isStaggered },
              })
            }
          />
          <Segmented
            value={isStaggered ? 'brick' : 'grid'}
            options={[
              { id: 'brick', label: 'Brick' },
              { id: 'grid', label: 'Straight' },
            ]}
            onChange={(id) =>
              onChange({
                ...value,
                tiled: { spacingNorm: currentSpacing, staggered: id === 'brick' },
              })
            }
          />
          {value.type === 'text' ? (
            <Meter
              label="Text size"
              valueLabel={`${currentFontSize} pt`}
              value={currentFontSize}
              min={10}
              max={48}
              step={1}
              onChange={(fontSizePt) => setText({ fontSizePt })}
            />
          ) : null}
        </View>
      )}

      <Meter
        label="Opacity"
        valueLabel={`${Math.round(value.opacity * 100)}%`}
        value={value.opacity}
        min={0.05}
        max={0.95}
        step={0.05}
        onChange={(opacity) => onChange({ ...value, opacity })}
      />
      <Meter
        label="Angle"
        valueLabel={`${value.rotationDeg}°`}
        value={value.rotationDeg}
        min={-90}
        max={90}
        step={5}
        onChange={(rotationDeg) => onChange({ ...value, rotationDeg })}
      />

      <PdfScopeSelector
        scope={value.scope}
        pageCount={pageCount}
        rangeError={rangeError}
        onChange={(scope) => {
          if (scope.mode === 'range') {
            const parsed = parsePageRange(String(scope.start), String(scope.end), pageCount);
            onChange({ ...value, scope: { mode: 'range', start: parsed.start, end: parsed.end } });
            return;
          }
          onChange({ ...value, scope });
        }}
      />
      {imageSourceSheet}
    </View>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  useThemeRefresh();
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={[styles.segmentBtn, on && styles.segmentBtnOn]}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Meter({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  useThemeRefresh();
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef(0);
  trackRef.current = trackWidth;
  const startRef = useRef(value);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const bounds = useRef({ min, max, step });
  bounds.current = { min, max, step };

  const fromX = (x: number) => {
    const width = trackRef.current;
    const b = bounds.current;
    if (width <= THUMB) return b.min;
    const travel = width - THUMB;
    const clamped = Math.min(width - THUMB / 2, Math.max(THUMB / 2, x));
    const ratio = (clamped - THUMB / 2) / travel;
    return snap(b.min + ratio * (b.max - b.min), b.min, b.max, b.step);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const next = fromX(evt.nativeEvent.locationX);
          startRef.current = next;
          changeRef.current(next);
        },
        onPanResponderMove: (_evt, gesture) => {
          const width = trackRef.current;
          const b = bounds.current;
          if (width <= THUMB) return;
          const travel = width - THUMB;
          const delta = (gesture.dx / travel) * (b.max - b.min);
          changeRef.current(snap(startRef.current + delta, b.min, b.max, b.step));
        },
      }),
    [],
  );

  const span = Math.max(0.0001, max - min);
  const travel = Math.max(1, trackWidth - THUMB);
  const left = ((value - min) / span) * travel;

  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text style={styles.kicker}>{label}</Text>
        <Text style={styles.meterValue} /* layout-ok: short meter value */>{valueLabel}</Text>
      </View>
      <View
        style={styles.trackHit}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setTrackWidth(w);
          trackRef.current = w;
        }}
        {...pan.panHandlers}>
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.trackFill, { width: left + THUMB / 2 }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left }]} />
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { gap: 12 },
  block: { gap: 10 },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: c.textMuted,
    flexShrink: 1,
  },
  hint: { fontSize: 12, lineHeight: 16, color: c.textMuted },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    backgroundColor: c.fill,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentBtnOn: { backgroundColor: c.accentSoft },
  segmentText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  segmentTextOn: { color: c.accent },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: c.text,
    fontSize: 15,
    backgroundColor: c.surface,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: c.fill,
  },
  chipOn: { backgroundColor: c.accentSoft },
  chipText: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
  chipTextOn: { color: c.accent },
  swatches: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: { borderColor: c.accent },
  swatchDot: { width: 18, height: 18, borderRadius: 9 },
  imageBtn: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: c.surface,
    gap: 2,
  },
  imageTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  imageHint: { fontSize: 12, color: c.textMuted },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeCopy: { flex: 1, gap: 2 },
  placeValue: { fontSize: 15, fontWeight: '600', color: c.text },
  anchor: {
    width: 92,
    height: 92,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  anchorCell: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.fill,
  },
  anchorCellOn: { backgroundColor: c.accentSoft },
  anchorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.textMuted,
  },
  anchorDotOn: { backgroundColor: c.accent },
  meter: { gap: 4 },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterValue: { fontSize: 13, fontWeight: '600', color: c.text },
  trackHit: { height: 32, justifyContent: 'center' },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: c.fillStrong,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: c.accent },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: c.surface,
    borderWidth: 2,
    borderColor: c.accent,
  },
}));
