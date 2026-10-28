import { useRouter } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from '@/components/ui/text-input';

import { AppIcon } from '@/components/app-icon';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { QualityControl, type QualityStepperProps } from '@/components/quality-control';
import { Type } from '@/constants/ui';
import { defaultLabelSettings } from '@/lib/label-settings';
import type { PdfPrintOptions } from '@/lib/pdf-editor/print';
import {
  parseCustomPageList,
  parsePageRange,
  resolvePrintPageIndices,
  type PdfPrintSelection,
} from '@/lib/pdf-editor/session';
import { clampToCap, qualityCapsFor, resolveQualityBridge } from '@/lib/printer/bridge-quality-caps';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type Mode = PdfPrintSelection['mode'];

/** Shipping labels print at this darkness so barcodes and small text stay sharp. */
const SHIPPING_DARKNESS = 7;

const MODES: { id: Mode; label: string; detail: string }[] = [
  { id: 'all', label: 'All pages', detail: 'Every page in the document' },
  { id: 'current', label: 'Current page', detail: 'Only the page you were just viewing' },
  { id: 'range', label: 'Range', detail: 'A continuous run, such as 1 to 4' },
  { id: 'custom', label: 'Custom', detail: 'Specific pages, such as 1, 3, 5' },
  { id: 'even', label: 'Even', detail: 'Pages 2, 4, 6…' },
  { id: 'odd', label: 'Odd', detail: 'Pages 1, 3, 5…' },
];

function SettingRow({
  label,
  value,
  valueColor,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  last,
}: Omit<QualityStepperProps, 'plusDisabled'> & {
  plusDisabled?: boolean;
  last?: boolean;
  valueColor?: string;
}) {
  useThemeRefresh();
  return (
    <View style={[styles.stepperRow, !last && styles.stepperRowBorder]}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          disabled={minusDisabled}
          onPress={onMinus}
          hitSlop={10}
          style={({ pressed }) => [
            styles.stepperCircle,
            minusDisabled && styles.stepperCircleDisabled,
            pressed && !minusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, minusDisabled && styles.stepperSymbolDisabled]}>−</Text>
        </Pressable>
        <Text style={[styles.stepperValue, valueColor ? { color: valueColor } : null]} /* layout-ok: stepper value in a minWidth slot */>{value}</Text>
        <Pressable
          disabled={plusDisabled}
          onPress={onPlus}
          hitSlop={10}
          style={({ pressed }) => [
            styles.stepperCircle,
            plusDisabled && styles.stepperCircleDisabled,
            pressed && !plusDisabled && styles.pressed,
          ]}>
          <Text style={[styles.stepperSymbol, plusDisabled && styles.stepperSymbolDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Same stepper, with a bottom border; QualityControl renders this one. */
function BorderedSettingRow(props: QualityStepperProps) {
  useThemeRefresh();
  return <SettingRow {...props} />;
}

export type PdfPrintPanelHandle = {
  submit: () => void;
};

export const PdfPrintPanel = forwardRef<
  PdfPrintPanelHandle,
  {
    pageCount: number;
    currentPage: number;
    printing: boolean;
    progress: string | null;
    outputLabel: string;
    onPrint: (selection: PdfPrintSelection, options: PdfPrintOptions) => void;
    /** 0-based pages the current choice would print, so the screen can show them. */
    onSelectedPagesChange?: (indices: number[]) => void;
    /** Shipping labels: print darkness starts at 7 (barcodes stay sharp), so no darkness tip is shown. */
    shipping?: boolean;
  }
>(function PdfPrintPanel(
  { pageCount, currentPage, printing, progress, outputLabel, onPrint, onSelectedPagesChange, shipping },
  ref,
) {
  useThemeRefresh();
  const router = useRouter();
  const status = usePrinterStore((s) => s.status);
  const printerDeviceId = usePrinterStore((s) => s.deviceId ?? s.lastDeviceId);
  const printerSdkId = usePrinterStore((s) => s.sdkId);
  const printerTransport = usePrinterStore((s) => s.transport);
  const printCalibration = usePrinterStore((s) => s.printCalibration);
  const setPrintCalibration = usePrinterStore((s) => s.setPrintCalibration);
  const live = status === 'connected' || status === 'printing';

  const qualityCaps = useMemo(
    () =>
      qualityCapsFor(
        resolveQualityBridge({
          activeTransport: getPrinterManager().transport,
          storeTransport: printerTransport,
          sdkId: printerSdkId,
        }),
      ),
    // `status` re-reads the manager's live transport after connect / disconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printerTransport, printerSdkId, status],
  );

  const labelDefaults = useMemo(() => defaultLabelSettings(), []);
  const calibrationKey = printerDeviceId ?? printerSdkId ?? 'unknown';
  const savedCalibration = printCalibration[calibrationKey];
  const [darkness, setDarkness] = useState<number | null>(
    shipping ? clampToCap(SHIPPING_DARKNESS, qualityCaps.density).value : labelDefaults.printDarkness,
  );
  const [speed, setSpeed] = useState<number | null>(labelDefaults.printSpeed);
  const [gapMm, setGapMm] = useState(labelDefaults.gapLengthMm);
  const [hOffset, setHOffset] = useState(savedCalibration?.hOffsetMm ?? 0);
  const [vOffset, setVOffset] = useState(savedCalibration?.vOffsetMm ?? 0);
  const [showAdvanced, setShowAdvanced] = useState(true);

  // Offsets saved for a printer load when it connects.
  const loadedKey = useRef(calibrationKey);
  useEffect(() => {
    if (loadedKey.current === calibrationKey) return;
    loadedKey.current = calibrationKey;
    setHOffset(savedCalibration?.hOffsetMm ?? 0);
    setVOffset(savedCalibration?.vOffsetMm ?? 0);
  }, [calibrationKey, savedCalibration?.hOffsetMm, savedCalibration?.vOffsetMm]);

  // Keep darkness and speed inside the connected bridge's scale.
  useEffect(() => {
    const d = clampToCap(darkness, qualityCaps.density);
    const sp = clampToCap(speed, qualityCaps.speed);
    if (d.clamped) setDarkness(d.value);
    if (sp.clamped) setSpeed(sp.value);
  }, [darkness, speed, qualityCaps]);

  const changeOffset = (axis: 'h' | 'v', next: number) => {
    const h = axis === 'h' ? next : hOffset;
    const v = axis === 'v' ? next : vOffset;
    if (axis === 'h') setHOffset(next);
    else setVOffset(next);
    if (calibrationKey === 'unknown') return;
    const prev = usePrinterStore.getState().printCalibration[calibrationKey];
    setPrintCalibration(calibrationKey, { ...prev, hOffsetMm: h, vOffsetMm: v });
  };

  const buildOptions = useCallback(
    (copies: number): PdfPrintOptions => ({
      copies,
      darkness,
      speed,
      gapMm,
      hOffsetMm: Math.round((hOffset + labelDefaults.hOffsetMm) * 100) / 100,
      vOffsetMm: Math.round((vOffset + labelDefaults.vOffsetMm) * 100) / 100,
    }),
    [darkness, gapMm, hOffset, labelDefaults.hOffsetMm, labelDefaults.vOffsetMm, speed, vOffset],
  );

  const [mode, setMode] = useState<Mode>('all');
  const [showPages, setShowPages] = useState(false);
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState(String(Math.max(1, pageCount)));
  const [custom, setCustom] = useState('');
  const [copies, setCopies] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(() => {
    if (printing) return;
    if (mode === 'all' || mode === 'current') {
      setError(null);
      onPrint({ mode }, buildOptions(copies));
      return;
    }
    if (mode === 'even' || mode === 'odd') {
      setError(null);
      onPrint({ mode }, buildOptions(copies));
      return;
    }
    if (mode === 'range') {
      const parsed = parsePageRange(rangeStart, rangeEnd, pageCount);
      if (!parsed.start || !parsed.end) {
        setError('Enter a valid page range.');
        return;
      }
      setError(parsed.error ?? null);
      onPrint({ mode: 'range', start: parsed.start, end: parsed.end }, buildOptions(copies));
      return;
    }
    const parsed = parseCustomPageList(custom, pageCount);
    if (parsed.error || parsed.pages.length === 0) {
      setError(parsed.error ?? 'Enter at least one page number.');
      return;
    }
    setError(null);
    onPrint({ mode: 'custom', pages: parsed.pages }, buildOptions(copies));
  }, [buildOptions, copies, custom, mode, onPrint, pageCount, printing, rangeEnd, rangeStart]);

  useImperativeHandle(ref, () => ({ submit }), [submit]);

  const selectedKey = useMemo(() => {
    let selection: PdfPrintSelection | null;
    if (mode === 'range') {
      const parsed = parsePageRange(rangeStart, rangeEnd, pageCount);
      selection = { mode: 'range', start: parsed.start, end: parsed.end };
    } else if (mode === 'custom') {
      const parsed = parseCustomPageList(custom, pageCount);
      selection = parsed.error ? null : { mode: 'custom', pages: parsed.pages };
    } else {
      selection = { mode };
    }
    return (selection ? resolvePrintPageIndices(selection, pageCount, currentPage - 1) : []).join(',');
  }, [currentPage, custom, mode, pageCount, rangeEnd, rangeStart]);

  useEffect(() => {
    onSelectedPagesChange?.(selectedKey ? selectedKey.split(',').map(Number) : []);
    // The key already captures every input; the callback is expected to be a state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const modeLabel = MODES.find((m) => m.id === mode)?.label ?? '';
  const pagesSummary =
    mode === 'all'
      ? `All ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`
      : mode === 'current'
        ? `Page ${currentPage} of ${pageCount}`
        : mode === 'range'
          ? `Pages ${rangeStart || '?'}–${rangeEnd || '?'}`
          : mode === 'custom'
            ? custom.trim() ? `Pages ${custom.trim()}` : 'Custom pages'
            : modeLabel;

  return (
    <View style={styles.wrap}>
      {!live && !shipping ? (
        <Pressable
          onPress={() => router.push('/printer-connect')}
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}>
          <AppIcon name="link" size={16} tintColor={C.danger} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>Printer not connected</Text>
            <Text style={styles.bannerSub}>Tap to connect your printer before printing.</Text>
          </View>
          <Text style={styles.bannerAction}>Connect</Text>
        </Pressable>
      ) : null}

      <View style={styles.card}>
        <WalkthroughTarget id="pdf.copies">
        <SettingRow
          label="Number of Copies"
          value={String(copies)}
          valueColor={C.accent}
          minusDisabled={printing || copies <= 1}
          plusDisabled={printing || copies >= 99}
          onMinus={() => setCopies((n) => Math.max(1, n - 1))}
          onPlus={() => setCopies((n) => Math.min(99, n + 1))}
        />
        </WalkthroughTarget>

        <WalkthroughTarget id="pdf.pages" style={styles.section}>
          <Pressable
            onPress={() => setShowPages((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showPages }}
            style={styles.pagesHead}>
            <Text style={styles.groupLabel}>
              Pages <Text style={styles.groupHint}>· {pagesSummary}</Text>
            </Text>
            <AppIcon name={showPages ? 'chevron.up' : 'chevron.down'} size={16} tintColor={C.textSecondary} />
          </Pressable>
          {showPages ? (
            <>
          <View style={styles.chipRow}>
            {MODES.map((item) => {
              const selected = mode === item.id;
              return (
                <Pressable
                  key={item.id}
                  disabled={printing}
                  onPress={() => {
                    setMode(item.id);
                    setError(null);
                  }}
                  style={[styles.chip, selected && styles.chipOn]}>
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.sub}>{MODES.find((m) => m.id === mode)?.detail}</Text>
          {mode === 'range' ? (
            <View style={styles.rangeRow}>
              <TextInput
                keyboardType="number-pad"
                value={rangeStart}
                onChangeText={setRangeStart}
                style={styles.input}
                editable={!printing}
              />
              <Text style={styles.to}>to</Text>
              <TextInput
                keyboardType="number-pad"
                value={rangeEnd}
                onChangeText={setRangeEnd}
                style={styles.input}
                editable={!printing}
              />
              <Text style={styles.hint} /* layout-ok: short page count */>of {pageCount}</Text>
            </View>
          ) : null}
          {mode === 'custom' ? (
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder="1, 3, 5"
              placeholderTextColor={C.textMuted}
              style={styles.custom}
              editable={!printing}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
            </>
          ) : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}
        </WalkthroughTarget>

        {shipping ? null : (
        <View style={[styles.section, styles.tip]}>
          <View style={styles.tipText}>
            <Text style={styles.tipTitle}>Printing shipping labels?</Text>
            <Text style={styles.sub}>Keep print darkness at 7 so barcodes and small text stay sharp and scannable.</Text>
          </View>
          <Pressable
            onPress={() => setDarkness(clampToCap(SHIPPING_DARKNESS, qualityCaps.density).value)}
            disabled={printing || darkness === SHIPPING_DARKNESS}
            accessibilityRole="button"
            accessibilityLabel="Set print darkness to 7"
            style={({ pressed }) => [styles.tipBtn, darkness === 7 && styles.tipBtnDone, pressed && styles.pressed]}>
            <Text style={[styles.tipBtnText, darkness === 7 && styles.tipBtnTextDone]}>
              {darkness === 7 ? 'Darkness is 7' : 'Set darkness to 7'}
            </Text>
          </Pressable>
        </View>
        )}

        <WalkthroughTarget id="pdf.advanced">
        <Pressable onPress={() => setShowAdvanced((v) => !v)} style={[styles.section, styles.advHead]}>
          <View style={styles.advLeft}>
            <AppIcon name="gearshape" size={18} tintColor={C.textSecondary} />
            <Text style={styles.advTitle}>Advanced Settings</Text>
          </View>
          <View style={styles.advRight}>
            <Text style={styles.advSummary} numberOfLines={1}>
              Darkness {darkness == null ? 'Auto' : darkness}
            </Text>
            <View style={styles.advChevron}>
              <AppIcon name={showAdvanced ? 'chevron.up' : 'chevron.down'} size={16} tintColor={C.textSecondary} />
            </View>
          </View>
        </Pressable>
        </WalkthroughTarget>
        {showAdvanced ? (
          <View style={styles.advBody}>
            {qualityCaps.density !== 'legacy' ? (
              <QualityControl cap={qualityCaps.density} value={darkness} onChange={setDarkness} Stepper={BorderedSettingRow} />
            ) : (
              <SettingRow
                label="Print Darkness"
                value={darkness == null ? 'Auto' : String(darkness)}
                minusDisabled={darkness != null && darkness <= 1}
                plusDisabled={darkness != null && darkness >= 15}
                onMinus={() => setDarkness((d) => (d == null ? 7 : d <= 1 ? null : d - 1))}
                onPlus={() => setDarkness((d) => (d == null ? 8 : Math.min(15, d + 1)))}
              />
            )}
            {qualityCaps.speed !== 'legacy' ? (
              <QualityControl
                cap={qualityCaps.speed}
                value={speed}
                onChange={setSpeed}
                Stepper={BorderedSettingRow}
                untestedNote="not tested on TD-404"
              />
            ) : (
              <SettingRow
                label="Print Speed"
                value={speed == null ? 'Auto' : String(speed)}
                minusDisabled={speed != null && speed <= 1}
                plusDisabled={speed != null && speed >= 8}
                onMinus={() => setSpeed((v) => (v == null ? 2 : v <= 1 ? null : v - 1))}
                onPlus={() => setSpeed((v) => (v == null ? 3 : Math.min(8, v + 1)))}
              />
            )}
            <SettingRow
              label="Gap Length"
              value={`${gapMm.toFixed(2)} mm`}
              minusDisabled={gapMm <= 0}
              onMinus={() => setGapMm((v) => Math.max(0, Math.round((v - 0.5) * 100) / 100))}
              onPlus={() => setGapMm((v) => Math.min(20, Math.round((v + 0.5) * 100) / 100))}
            />
            <SettingRow
              label="Horizontal Offset (saved for this printer)"
              value={`${hOffset.toFixed(2)} mm`}
              minusDisabled={hOffset <= -10}
              plusDisabled={hOffset >= 10}
              onMinus={() => changeOffset('h', Math.max(-10, Math.round((hOffset - 0.5) * 100) / 100))}
              onPlus={() => changeOffset('h', Math.min(10, Math.round((hOffset + 0.5) * 100) / 100))}
            />
            <SettingRow
              label="Vertical Offset (saved for this printer)"
              value={`${vOffset.toFixed(2)} mm`}
              minusDisabled={vOffset <= -10}
              plusDisabled={vOffset >= 20}
              last
              onMinus={() => changeOffset('v', Math.max(-10, Math.round((vOffset - 0.5) * 100) / 100))}
              onPlus={() => changeOffset('v', Math.min(20, Math.round((vOffset + 0.5) * 100) / 100))}
            />
          </View>
        ) : null}
      </View>

      {progress ? <Text style={styles.progress}>{progress}</Text> : null}
      <Text style={styles.note}>
        {modeLabel} · {outputLabel}. Preview above is exactly what prints.
      </Text>
    </View>
  );
});

const styles = themedStyles((c, scheme) => ({
  wrap: { gap: 10 },
  pressed: { opacity: 0.65 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.dangerSoft,
    borderColor: c.dangerSoft,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, gap: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: c.danger },
  bannerSub: { fontSize: 12, color: c.danger },
  bannerAction: { fontSize: 14, fontWeight: '700', color: c.danger },
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    ...cardElevation(c, scheme),
  },
  section: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
    gap: 8,
  },
  pagesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupLabel: { ...Type.bodyMedium, color: c.text },
  groupHint: { fontWeight: '400', color: c.textSecondary, fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  chipOn: { backgroundColor: c.accentFill, borderColor: c.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  chipTextOn: { color: c.onAccent },
  sub: { fontSize: 12, color: c.textSecondary },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 64,
    borderWidth: 1,
    borderColor: c.hairline,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: 'center',
    color: c.text,
    backgroundColor: c.surface,
  },
  custom: {
    borderWidth: 1,
    borderColor: c.hairline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: c.text,
    backgroundColor: c.surface,
  },
  to: { color: c.textMuted },
  hint: { color: c.textMuted, fontSize: 13 },
  err: { color: c.danger, fontSize: 12 },
  tip: { gap: 10 },
  tipText: { gap: 2 },
  tipTitle: { fontSize: 14, fontWeight: '700', color: c.text },
  tipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  tipBtnDone: { borderColor: c.border, backgroundColor: c.surface },
  tipBtnText: { fontSize: 14, fontWeight: '700', color: c.accentInk },
  tipBtnTextDone: { color: c.textSecondary },
  advHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  advLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  advChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  advTitle: { ...Type.body, fontWeight: '600', color: c.text, flexShrink: 1 },
  advRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  advSummary: { fontSize: 12, color: c.textSecondary, flexShrink: 1 },
  advBody: {
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 10,
  },
  stepperRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
  stepperLabel: { ...Type.body, color: c.text, flex: 1, paddingRight: 8 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDisabled: { borderColor: c.border },
  stepperSymbol: { fontSize: 18, fontWeight: '400', color: c.accent, lineHeight: 20 },
  stepperSymbolDisabled: { color: c.textDisabled },
  stepperValue: { ...Type.bodyMedium, color: c.text, minWidth: 68, textAlign: 'center' },
  note: { fontSize: 12, color: c.textMuted, textAlign: 'center' },
  progress: { textAlign: 'center', color: c.textMuted },
}));
