import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { KindBarcodeGlyph, KindQrGlyph, KindTextGlyph } from '@/components/excel-kind-icons';
import { ExcelLabelPreview } from '@/components/excel-label-preview';
import { WalkthroughOverlay } from '@/components/walkthrough/walkthrough-overlay';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { MaxContentWidth, Spacing } from '@/constants/theme';

import {
  attachBulkToLabelDocument,
  createBulkLabelDocument,
  defaultBulkColumnMappings,
  guessBulkSlotKind,
  type BulkColumnMapping,
  type BulkSlotKind,
} from '@/lib/bulk-labels';
import {
  copiesColumnChoices,
  copiesChangeSummary,
  guessCopiesColumnIndex,
} from '@/lib/bulk-row-copies';
import type { ExcelSheet } from '@/stores/data-store';
import { clampLabelMm } from '@/lib/label-geometry';
import { createUpsConfig, type LabelDocument } from '@/lib/label-document';
import { EXCEL_COLUMNS_WALKTHROUGH } from '@/lib/walkthrough/excel-steps';
import { setWalkthroughScroller } from '@/lib/walkthrough/registry';
import { useDataStore } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWalkthroughStore } from '@/stores/walkthrough-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const KINDS: { id: BulkSlotKind; Glyph: typeof KindTextGlyph }[] = [
  { id: 'text', Glyph: KindTextGlyph },
  { id: 'barcode', Glyph: KindBarcodeGlyph },
  { id: 'qrcode', Glyph: KindQrGlyph },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function mappingsForSheet(sheet: ExcelSheet, copiesColumnIndex: number | null): BulkColumnMapping[] {
  return defaultBulkColumnMappings(sheet).map((mapping) =>
    mapping.columnIndex === copiesColumnIndex ? { ...mapping, include: false } : mapping,
  );
}

function applyExcelLabelSetup(
  doc: LabelDocument,
  setup: {
    name?: string;
    circle: boolean;
    columns: number;
    gapMm: number;
    batchEdit: boolean;
  },
): LabelDocument {
  const next: LabelDocument = {
    ...doc,
    ...(setup.name ? { name: setup.name } : {}),
    ...(setup.circle ? { mediaShape: 'circle' as const } : {}),
  };
  if (setup.columns < 2) return next;
  const ups = createUpsConfig({
    columns: setup.columns,
    columnSpacingMm: setup.gapMm,
    batchEdit: setup.batchEdit,
    seedElements: next.elements,
  });
  ups.panels[0] = next.elements;
  next.ups = ups;
  next.templateCategory = 'Multi-UP';
  return next;
}

function paramMm(value: string | string[] | undefined, fallback: number): number {
  const raw = firstParam(value);
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ExcelBulkSetupScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    excelFileId?: string | string[];
    widthMm?: string | string[];
    heightMm?: string | string[];
    labelName?: string | string[];
    mediaShape?: string | string[];
    columns?: string | string[];
    gapMm?: string | string[];
    batchEdit?: string | string[];
    sheetIndex?: string | string[];
    targetLabelId?: string | string[];
  }>();
  const targetLabelId = firstParam(params.targetLabelId);
  const excelFileId = firstParam(params.excelFileId);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const setActiveSheetIndex = useDataStore((s) => s.setActiveSheetIndex);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const getDocument = useLabelStore((s) => s.getDocument);
  const defaults = useSettingsStore((s) => s.defaults);
  const startWalkthrough = useWalkthroughStore((s) => s.start);
  const stopWalkthrough = useWalkthroughStore((s) => s.stop);
  const setExcelColumnsTutorialSeen = useSettingsStore((s) => s.setExcelColumnsTutorialSeen);
  const scrollRef = useRef<import('react-native').ScrollView>(null);
  const scrollY = useRef(0);

  const file = excelFiles.find((f) => f.id === excelFileId) ?? null;
  const initialSheet = Number.parseInt(firstParam(params.sheetIndex) ?? '', 10);
  const [sheetIndex, setSheetIndex] = useState(
    Number.isFinite(initialSheet) ? initialSheet : file?.activeSheetIndex ?? 0,
  );
  const sheet = file ? file.sheets[sheetIndex] ?? file.sheets[0] ?? null : null;

  const labelSize = clampLabelMm(
    paramMm(params.widthMm, defaults.labelWidth),
    paramMm(params.heightMm, defaults.labelHeight),
  );

  // Off by default: every label prints once until the user asks for different copies.
  const [copiesColumnIndex, setCopiesColumnIndex] = useState<number | null>(null);
  const [mappings, setMappings] = useState<BulkColumnMapping[]>(() =>
    sheet ? mappingsForSheet(sheet, null) : [],
  );
  const [displayHead, setDisplayHead] = useState(false);
  const [differentCopies, setDifferentCopies] = useState(false);
  const labelName = firstParam(params.labelName);
  const circle = firstParam(params.mediaShape) === 'circle';
  const across = Number.parseInt(firstParam(params.columns) ?? '1', 10);
  const gapMm = Number.parseFloat(firstParam(params.gapMm) ?? '0');
  const batchEdit = firstParam(params.batchEdit) === '1';

  useEffect(() => {
    setWalkthroughScroller((dy) =>
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: false }),
    );
    return () => setWalkthroughScroller(null);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maybeStart = () => {
      if (useSettingsStore.getState().excelColumnsTutorialSeen) return;
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

  const columnCount = sheet?.columns.length ?? 0;
  const syncedMappings = useMemo(() => {
    const chosen =
      sheet && copiesColumnIndex != null && copiesColumnChoices(sheet).includes(copiesColumnIndex)
        ? copiesColumnIndex
        : null;
    if (mappings.length === columnCount) return mappings;
    return sheet ? mappingsForSheet(sheet, chosen) : [];
  }, [columnCount, copiesColumnIndex, mappings, sheet]);

  const includedCount = syncedMappings.filter((m) => m.include).length;
  const canConfirm = Boolean(file && sheet && includedCount > 0 && sheet.rows.length > 0);
  const copiesChoices = sheet ? copiesColumnChoices(sheet) : [];
  const activeCopiesIndex = copiesChoices.includes(copiesColumnIndex ?? -1) ? copiesColumnIndex : null;
  const copiesWarning = sheet ? copiesChangeSummary(sheet, activeCopiesIndex) : null;
  const copiesColumnName =
    sheet && activeCopiesIndex != null ? sheet.columns[activeCopiesIndex] ?? 'Copies' : null;

  const selectCopiesColumn = (next: number | null) => {
    if (!sheet) return;
    const previous = activeCopiesIndex;
    setCopiesColumnIndex(next);
    setMappings((prev) => {
      const base = prev.length === columnCount ? prev : mappingsForSheet(sheet, next);
      const defaults = defaultBulkColumnMappings(sheet);
      return base.map((mapping) => {
        if (mapping.columnIndex === next) return { ...mapping, include: false };
        if (previous != null && mapping.columnIndex === previous) {
          return { ...mapping, include: defaults[mapping.columnIndex]?.include ?? false };
        }
        return mapping;
      });
    });
  };

  const patchMapping = (columnIndex: number, patch: Partial<BulkColumnMapping>) => {
    if (columnIndex === activeCopiesIndex) return;
    setMappings((prev) => {
      const base = prev.length === columnCount ? prev : sheet ? defaultBulkColumnMappings(sheet) : [];
      return base.map((m) => (m.columnIndex === columnIndex ? { ...m, ...patch } : m));
    });
  };

  const handleConfirm = () => {
    if (!file || !sheet) return;
    if (includedCount === 0) {
      Alert.alert('Select columns', 'Include at least one column to build labels.');
      return;
    }
    if (sheet.rows.length === 0) {
      Alert.alert('Empty sheet', 'This sheet has no data rows.');
      return;
    }
    setActiveSheetIndex(file.id, sheetIndex);

    if (targetLabelId) {
      const existing = getDocument(targetLabelId);
      if (!existing) {
        Alert.alert('Label missing', 'Return to the editor and try importing again.');
        return;
      }
      const attached = attachBulkToLabelDocument(existing, {
        excelFileId: file.id,
        sheetIndex,
        sheet,
        mappings: syncedMappings,
        barcodeEncodeMode: defaults.barcodeEncodeMode,
        qrErrorLevel: defaults.qrErrorLevel,
        displayHead,
        copiesColumnIndex: activeCopiesIndex,
      });
      if (!attached) {
        Alert.alert('Unable to create labels', 'Include at least one column.');
        return;
      }
      upsertDocument(attached);
      router.replace({
        pathname: '/edit',
        params: { labelId: targetLabelId, excelBulkRefresh: String(Date.now()) },
      });
      return;
    }

    const doc = createBulkLabelDocument({
      name: labelName || `${file.name} · ${sheet.rows.length} labels`,
      widthMm: labelSize.widthMm,
      heightMm: labelSize.heightMm,
      orientation: defaults.orientation,
      paperType: defaults.paperType,
      excelFileId: file.id,
      sheetIndex,
      sheet,
      mappings: syncedMappings,
      barcodeEncodeMode: defaults.barcodeEncodeMode,
      qrErrorLevel: defaults.qrErrorLevel,
      displayHead,
      copiesColumnIndex: activeCopiesIndex,
    });
    if (!doc) {
      Alert.alert('Unable to create labels', 'Include at least one column.');
      return;
    }
    upsertDocument(
      applyExcelLabelSetup(doc, {
        circle,
        columns: Number.isFinite(across) ? across : 1,
        gapMm: Number.isFinite(gapMm) ? gapMm : 0,
        batchEdit,
      }),
    );
    router.replace({ pathname: '/edit', params: { labelId: doc.id } });
  };

  if (!file || !sheet) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
            <AppIcon name="chevron.left" tintColor={C.onAccent} size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Data Column</Text>
          <View style={styles.headerBtn} />
        </View>
        <Text style={styles.empty}>This file is no longer available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor={C.onAccent} size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Data Column</Text>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => startWalkthrough('excel')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Copies walkthrough"
            style={({ pressed }) => [styles.helpBtn, pressed && styles.pressed]}>
            <AppIcon name="questionmark.circle.fill" tintColor={C.onAccent} size={22} />
          </Pressable>
          <Pressable
            disabled={!canConfirm}
            onPress={handleConfirm}
            hitSlop={8}
            style={({ pressed }) => [styles.headerAction, pressed && canConfirm && styles.pressed]}>
            <Text style={[styles.confirmHeader, !canConfirm && styles.confirmHeaderOff]}>Confirm</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled">
        {file.sheets.length > 1 ? (
          <View style={styles.sheetChips}>
            {file.sheets.map((item, index) => {
              const active = index === sheetIndex;
              return (
                <Pressable
                  key={`${item.name}-${index}`}
                  onPress={() => {
                    setSheetIndex(index);
                    setCopiesColumnIndex(null);
                    setDifferentCopies(false);
                    setMappings(mappingsForSheet(item, null));
                  }}
                  style={[styles.chip, active && styles.chipOn]}>
                  <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <WalkthroughTarget id="excel.copies">
        <View style={styles.copiesCard}>
          <View style={styles.displayHeadRow}>
            <Text style={[styles.copiesTitle, { flex: 1 }]}>
              Print a different number of copies for each label?
            </Text>
            <Switch
              value={differentCopies}
              onValueChange={(on) => {
                setDifferentCopies(on);
                if (!on) {
                  selectCopiesColumn(null);
                } else if (sheet && activeCopiesIndex == null) {
                  // Pre-pick the obvious one (like Qty) so most people only have to switch this on.
                  const guess = guessCopiesColumnIndex(sheet);
                  if (guess != null) selectCopiesColumn(guess);
                }
              }}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
            />
          </View>
          {differentCopies ? (
            <>
              <Text style={styles.copiesNote}>
                {copiesColumnName
                  ? `Each label prints as many times as the number in "${copiesColumnName}". Labels with a blank or 0 there are not printed.`
                  : 'Choose the column that has the number of copies for each label.'}
              </Text>
              <View style={styles.sheetChips}>
                {copiesChoices.map((columnIndex) => {
                  const active = columnIndex === activeCopiesIndex;
                  return (
                    <Pressable
                      key={`copies-${columnIndex}`}
                      onPress={() => selectCopiesColumn(active ? null : columnIndex)}
                      style={[styles.chip, active && styles.chipOn]}>
                      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
                        {sheet.columns[columnIndex]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {copiesChoices.length === 0 ? (
                <Text style={styles.copiesNote}>
                  No column with numbers was found. Add a column with the copies (like Qty) to your sheet.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.copiesNote}>Every label prints once. Turn this on to print some labels more than once.</Text>
          )}
          {copiesWarning ? <Text style={styles.copiesNote}>{copiesWarning}</Text> : null}
        </View>
        </WalkthroughTarget>

        <WalkthroughTarget id="excel.columns">
        <View>
        {sheet.columns.map((name, columnIndex) => {
          const mapping = syncedMappings[columnIndex] ?? {
            columnIndex,
            include: true,
            kind: guessBulkSlotKind(name),
          };
          const locked = columnIndex === activeCopiesIndex;
          return (
            <View
              key={`${name}-${columnIndex}`}
              style={[styles.columnCard, locked && styles.columnCardLocked]}>
              <Pressable
                disabled={locked}
                onPress={() => patchMapping(columnIndex, { include: !mapping.include })}
                hitSlop={6}
                style={styles.checkHit}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: mapping.include, disabled: locked }}>
                <View style={[styles.check, mapping.include && styles.checkOn]}>
                  {mapping.include ? (
                    <AppIcon name="checkmark" tintColor={C.onAccent} size={13} />
                  ) : null}
                </View>
              </Pressable>
              <Text style={[styles.columnName, locked && styles.columnNameLocked]} numberOfLines={1}>
                {locked ? `${name} · label count` : name}
              </Text>
              <View style={styles.kindRow}>
                {KINDS.map(({ id, Glyph }) => (
                  <Pressable
                    key={id}
                    disabled={locked || !mapping.include}
                    onPress={() => patchMapping(columnIndex, { kind: id })}
                    style={!locked && !mapping.include ? styles.kindOff : undefined}>
                    <Glyph active={!locked && mapping.include && mapping.kind === id} />
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
        </View>
        </WalkthroughTarget>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.displayHeadRow}>
          <Text style={styles.displayHeadLabel}>Display head</Text>
          <Switch
            value={displayHead}
            onValueChange={setDisplayHead}
            trackColor={{ false: C.border, true: C.accent }}
            thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
          />
        </View>
        <ExcelLabelPreview sheet={sheet} mappings={syncedMappings} displayHead={displayHead} />
      </View>
      <WalkthroughOverlay
        tour="excel"
        steps={EXCEL_COLUMNS_WALKTHROUGH}
        onFinish={() => {
          setExcelColumnsTutorialSeen(true);
          stopWalkthrough();
        }}
      />
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.fill },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: c.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  headerBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: c.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helpBtn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerAction: { minWidth: 72, alignItems: 'flex-end', paddingRight: 4 },
  confirmHeader: { color: c.onAccent, fontSize: 16, fontWeight: '400' },
  confirmHeaderOff: { color: 'rgba(255,255,255,0.4)' }, // theme-fixed: white on header
  body: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  bodyContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 10 },
  empty: { padding: Spacing.four, color: c.textMuted, textAlign: 'center' },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: c.surface,
  },
  chipOn: { backgroundColor: c.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: c.text },
  chipTextOn: { color: c.onAccent },
  copiesCard: {
    backgroundColor: c.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  copiesTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  copiesNote: { fontSize: 13, color: c.textMuted },
  columnCard: {
    backgroundColor: c.surface,
    borderRadius: 10,
    minHeight: 54,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  columnCardLocked: { opacity: 0.45 },
  checkHit: { paddingVertical: 8 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
  checkOn: { backgroundColor: c.accent, borderColor: c.accent },
  columnName: { flex: 1, fontSize: 16, fontWeight: '400', color: c.textSecondary },
  columnNameLocked: { color: c.textDisabled },
  kindRow: { flexDirection: 'row', alignItems: 'center' },
  kindOff: { opacity: 0.35 },
  dock: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  displayHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  displayHeadLabel: { fontSize: 15, color: c.textSecondary },
  pressed: { opacity: 0.7 },
}));
