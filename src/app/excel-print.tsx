import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import {
  CollapsibleBar,
  LabelPreview,
  NumberField,
  SegmentedControl,
  StepperRow,
} from '@/components/new-label/new-label-parts';
import { TextInput } from '@/components/ui/text-input';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { WalkthroughOverlay } from '@/components/walkthrough/walkthrough-overlay';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { Spacing } from '@/constants/theme';

import { useExcelImportFlow } from '@/lib/use-excel-import-flow';
import { EXCEL_WALKTHROUGH } from '@/lib/walkthrough/excel-steps';
import { setWalkthroughScroller } from '@/lib/walkthrough/registry';
import { clampLabelMm } from '@/lib/label-geometry';
import {
  GAP_MAX_MM,
  GAP_MIN_MM,
  MAX_COLUMNS,
  NAME_MAX,
  NEW_LABEL_PRESETS,
  cellSize,
  clampColumns,
  fmtMm,
  initialFormState,
  parseGapMm,
  presetLabelFor,
  resolvedName,
  stepGap,
  switchShape,
  totalWidthMm,
  validateForm,
  widthWarning,
  type FormState,
  type Shape,
} from '@/lib/new-label-form';
import { resolveProfile } from '@/printer-core/profiles';
import { stageImportedFile } from '@/lib/user-files/stage-import';
import { useDataStore } from '@/stores/data-store';
import { usePrinterStore } from '@/stores/printer-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWalkthroughStore } from '@/stores/walkthrough-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/**
 * Dashboard Print Excel: same label setup as New Label → Blank Label, then the file.
 */
export default function ExcelPrintScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const addExcelFile = useDataStore((s) => s.addExcelFile);
  const { importExcel, excelImportModal, documentSourceSheet } = useExcelImportFlow();
  const [form, setForm] = useState<FormState>(() => initialFormState({}));
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [triedContinue, setTriedContinue] = useState(false);
  const [picking, setPicking] = useState(false);
  const patch = useCallback((p: Partial<FormState>) => setForm((f) => ({ ...f, ...p })), []);
  const scrollRef = useRef<import('react-native').ScrollView>(null);
  const scrollY = useRef(0);
  const firstField = useRef<import('react-native').TextInput>(null);
  const secondField = useRef<import('react-native').TextInput>(null);
  const gapField = useRef<import('react-native').TextInput>(null);
  const nameField = useRef<import('react-native').TextInput>(null);
  const startWalkthrough = useWalkthroughStore((s) => s.start);
  const stopWalkthrough = useWalkthroughStore((s) => s.stop);
  const setExcelTutorialSeen = useSettingsStore((s) => s.setExcelTutorialSeen);

  const printerStatus = usePrinterStore((s) => s.status);
  const printerSdk = usePrinterStore((s) => s.sdkId);
  const printerName = usePrinterStore((s) => s.deviceName);
  const printerMaxMm = useMemo(() => {
    if (printerStatus !== 'connected' || !printerSdk) return null;
    try {
      return resolveProfile(printerSdk, printerName)?.maxWidthMm ?? null;
    } catch {
      return null;
    }
  }, [printerName, printerSdk, printerStatus]);

  const { errors, canCreate } = validateForm(form);
  const cell = cellSize(form);
  const gapMm = parseGapMm(form.gap) ?? 0;
  const multi = form.columns > 1;
  const total = cell.w != null ? totalWidthMm(cell.w, form.columns, gapMm) : null;
  const warning = multi && total != null ? widthWarning(total, printerMaxMm) : null;
  const presetValue = presetLabelFor(form.shape, cell.w, cell.h);
  const err = (key: keyof typeof errors) => (triedContinue ? errors[key] ?? 'Enter a number' : errors[key]);

  useEffect(() => {
    setWalkthroughScroller((dy) =>
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: false }),
    );
    return () => setWalkthroughScroller(null);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maybeStart = () => {
      if (useSettingsStore.getState().excelTutorialSeen) return;
      timer = setTimeout(() => startWalkthrough('excel'), 500);
    };
    if (useSettingsStore.persist.hasHydrated()) maybeStart();
    const unsub = useSettingsStore.persist.onFinishHydration(maybeStart);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [startWalkthrough]);

  useEffect(
    () => () => {
      const { active, tour } = useWalkthroughStore.getState();
      if (active && tour === 'excel') useWalkthroughStore.getState().stop();
    },
    [],
  );

  const setColumns = (n: number) => {
    patch({ columns: Math.max(2, clampColumns(n)) });
  };

  const continueToFile = async () => {
    if (picking) return;
    setTriedContinue(true);
    if (!canCreate || cell.w == null || cell.h == null) return;
    const size = clampLabelMm(cell.w, cell.h);

    setPicking(true);
    try {
      const picked = await importExcel();
      if (!picked) return;

      const storedUri = await stageImportedFile('excel', picked.uri, picked.name);
      const entry = addExcelFile({
        name: picked.name,
        uri: storedUri,
        sheets: picked.sheets,
        activeSheetIndex: 0,
        hasHeaderRow: picked.hasHeaderRow,
        dataStartRow: picked.dataStartRow,
      });
      router.replace({
        pathname: '/excel-data-preview',
        params: {
          excelFileId: entry.id,
          widthMm: String(size.widthMm),
          heightMm: String(size.heightMm),
          labelName: resolvedName(form.name),
          ...(form.shape === 'circle' ? { mediaShape: 'circle' } : {}),
          columns: String(form.columns),
          gapMm: String(gapMm),
          ...(form.batchEdit ? { batchEdit: '1' } : {}),
        },
      });
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Unable to pick or parse the document.',
      );
    } finally {
      setPicking(false);
    }
  };

  const sizeTitle = multi ? 'Size of each label' : 'Size';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          disabled={picking}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Excel</Text>
        <Pressable
          onPress={() => startWalkthrough('excel')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Excel walkthrough"
          style={({ pressed }) => [styles.helpBtn, pressed && styles.pressed]}>
          <AppIcon name="questionmark.circle.fill" tintColor={C.onAccent} size={22} />
        </Pressable>
      </View>

      <FormScrollView
        ref={scrollRef}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
        bottomOffset={96}
        showsVerticalScrollIndicator={false}>
        <LabelPreview shape={form.shape} columns={form.columns} cellW={cell.w} cellH={cell.h} gap={gapMm} />

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Shape</Text>
          <SegmentedControl<Shape>
            value={form.shape}
            onChange={(s) => setForm((f) => switchShape(f, s))}
            options={[
              { id: 'rectangle', label: 'Rectangle' },
              { id: 'circle', label: 'Circle' },
            ]}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Labels across</Text>
            <Switch
              value={multi}
              onValueChange={(on) => patch({ columns: on ? 2 : 1 })}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
            />
          </View>
          <Text style={styles.note}>
            Use this when your roll is wide enough to print two or more labels side by side in one pass. Off prints one label per feed.
          </Text>
          {multi ? (
            <StepperRow
              label="Number of columns"
              valueText={String(form.columns)}
              onMinus={() => setColumns(form.columns - 1)}
              onPlus={() => setColumns(form.columns + 1)}
              minusDisabled={form.columns <= 2}
              plusDisabled={form.columns >= MAX_COLUMNS}
              chips={[2, 3, 4].map((n) => ({
                text: String(n),
                active: form.columns === n,
                onPress: () => setColumns(n),
              }))}
            />
          ) : null}
        </View>

        <WalkthroughTarget id="excel.size">
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>{sizeTitle}</Text>
            {form.shape === 'circle' ? (
              <NumberField
                ref={firstField}
                label="Diameter"
                value={form.diameter}
                onChangeText={(v) => patch({ diameter: v })}
                error={err('diameter')}
                returnKeyType="done"
              />
            ) : (
              <>
                <NumberField
                  ref={firstField}
                  label="Width"
                  value={form.width}
                  onChangeText={(v) => patch({ width: v })}
                  error={err('width')}
                  onSubmitEditing={() => secondField.current?.focus()}
                />
                <NumberField
                  ref={secondField}
                  label="Height"
                  value={form.height}
                  onChangeText={(v) => patch({ height: v })}
                  error={err('height')}
                  returnKeyType={multi ? 'next' : 'done'}
                  onSubmitEditing={() => (multi ? gapField.current?.focus() : nameField.current?.focus())}
                />
              </>
            )}
          </View>
        </WalkthroughTarget>

        {multi ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Gap between columns</Text>
            <StepperRow
              label="Gap"
              valueText={`${fmtMm(gapMm)} mm`}
              onMinus={() => patch({ gap: stepGap(form.gap, -1) })}
              onPlus={() => patch({ gap: stepGap(form.gap, 1) })}
              minusDisabled={gapMm <= GAP_MIN_MM}
              plusDisabled={gapMm >= GAP_MAX_MM}
            />
            <NumberField
              ref={gapField}
              label="Gap (type 0 or more)"
              value={form.gap.startsWith('-') ? '' : form.gap}
              onChangeText={(v) => patch({ gap: v })}
              error={err('gap')}
              returnKeyType="done"
            />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total width</Text>
              <Text style={styles.totalValue}>
                {form.columns} × {fmtMm(cell.w ?? 0)} + {form.columns - 1} × {fmtMm(gapMm)} = {total != null ? fmtMm(total) : '-'} mm
              </Text>
            </View>
            {warning ? <Text style={styles.warn}>{warning}</Text> : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <CollapsibleBar title="Size presets" open={presetsOpen} onToggle={() => setPresetsOpen((o) => !o)}>
            <View style={styles.presetGrid}>
              {NEW_LABEL_PRESETS.map((p) => {
                const active = presetValue === p.label;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() =>
                      setForm((f) => ({
                        ...f,
                        shape: 'rectangle',
                        width: fmtMm(p.width),
                        height: fmtMm(p.height),
                        lastRect: { width: fmtMm(p.width), height: fmtMm(p.height) },
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [styles.presetChip, active && styles.presetChipActive, pressed && styles.pressed]}>
                    <Text style={[styles.presetChipText, active && styles.presetChipTextActive]} numberOfLines={1}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </CollapsibleBar>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Label name</Text>
          <TextInput
            ref={nameField}
            value={form.name}
            onChangeText={(v) => patch({ name: v.slice(0, NAME_MAX) })}
            placeholder="Default label"
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            accessibilityLabel="Label name"
            style={styles.nameInput}
          />
        </View>

        {multi ? (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Batch edit</Text>
            <Switch
              value={form.batchEdit}
              onValueChange={(v) => patch({ batchEdit: v })}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
            />
          </View>
        ) : null}
      </FormScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.stickyHost}>
        <WalkthroughTarget id="excel.continue" style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
          <Pressable
            disabled={picking || !canCreate}
            onPress={() => void continueToFile()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.continueBtn,
              (picking || !canCreate) && styles.continueBtnDisabled,
              pressed && !picking && canCreate && styles.pressed,
            ]}>
            {picking ? (
              <ActivityIndicator color={C.onAccent} />
            ) : (
              <Text style={styles.continueText}>Continue</Text>
            )}
          </Pressable>
        </WalkthroughTarget>
      </KeyboardStickyView>

      {documentSourceSheet}
      {excelImportModal}
      <WalkthroughOverlay
        tour="excel"
        steps={EXCEL_WALKTHROUGH}
        onFinish={() => {
          setExcelTutorialSeen(true);
          stopWalkthrough();
        }}
      />
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    backgroundColor: c.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backChevron: { color: c.onAccent, fontSize: 32, fontWeight: '300', lineHeight: 36 },
  headerTitle: { flex: 1, textAlign: 'center', color: c.onAccent, fontSize: 17, fontWeight: '500' },
  helpBtn: { width: 36, alignItems: 'flex-end' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, gap: 14 },
  section: { gap: 8 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  note: { fontSize: 12, color: c.textSecondary, marginLeft: 2 },
  warn: { fontSize: 13, fontWeight: '600', color: c.danger, marginLeft: 2 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: c.text },
  totalValue: { fontSize: 13, color: c.textSecondary, flexShrink: 1, textAlign: 'right' },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    width: '31.5%',
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetChipActive: { backgroundColor: c.accentSoft, borderColor: c.accent },
  presetChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, lineHeight: 16, textAlign: 'center' },
  presetChipTextActive: { color: c.accent },
  nameInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    fontSize: 16,
    color: c.text,
  },
  switchRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { fontSize: 15, fontWeight: '500', color: c.text },
  stickyHost: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: c.bg },
  continueBtn: { backgroundColor: c.accentFill, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  continueBtnDisabled: { opacity: 0.4 },
  continueText: { color: c.onAccent, fontSize: 17, fontWeight: '500' },
  pressed: { opacity: 0.75 },
}));
