import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
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
  countChangedCopiesCells,
  guessCopiesColumnIndex,
} from '@/lib/bulk-row-copies';
import type { ExcelSheet } from '@/stores/data-store';
import { clampLabelMm } from '@/lib/label-geometry';
import { useDataStore } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
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

  const [copiesColumnIndex, setCopiesColumnIndex] = useState<number | null>(() =>
    sheet ? guessCopiesColumnIndex(sheet) : null,
  );
  const [mappings, setMappings] = useState<BulkColumnMapping[]>(() =>
    sheet ? mappingsForSheet(sheet, guessCopiesColumnIndex(sheet)) : [],
  );
  const [displayHead, setDisplayHead] = useState(false);

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
  const changedCopies = sheet ? countChangedCopiesCells(sheet, activeCopiesIndex) : 0;
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
      name: `${file.name} · ${sheet.rows.length} labels`,
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
    upsertDocument(doc);
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
        <Pressable
          disabled={!canConfirm}
          onPress={handleConfirm}
          hitSlop={8}
          style={({ pressed }) => [styles.headerAction, pressed && canConfirm && styles.pressed]}>
          <Text style={[styles.confirmHeader, !canConfirm && styles.confirmHeaderOff]}>Confirm</Text>
        </Pressable>
      </View>

      <ScrollView
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
                    const guessed = guessCopiesColumnIndex(item);
                    setSheetIndex(index);
                    setCopiesColumnIndex(guessed);
                    setMappings(mappingsForSheet(item, guessed));
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

        <View style={styles.copiesCard}>
          <Text style={styles.copiesTitle}>
            {copiesColumnName
              ? `Copies column: ${copiesColumnName}`
              : 'Copies column: None — each row prints once'}
          </Text>
          <View style={styles.sheetChips}>
            <Pressable
              onPress={() => selectCopiesColumn(null)}
              style={[styles.chip, activeCopiesIndex == null && styles.chipOn]}>
              <Text style={[styles.chipText, activeCopiesIndex == null && styles.chipTextOn]}>None</Text>
            </Pressable>
            {copiesChoices.map((columnIndex) => {
              const active = columnIndex === activeCopiesIndex;
              return (
                <Pressable
                  key={`copies-${columnIndex}`}
                  onPress={() => selectCopiesColumn(columnIndex)}
                  style={[styles.chip, active && styles.chipOn]}>
                  <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
                    {sheet.columns[columnIndex]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {copiesChoices.length === 0 ? (
            <Text style={styles.copiesNote}>No number columns in this sheet.</Text>
          ) : null}
          {changedCopies > 0 ? (
            <Text style={styles.copiesNote}>
              {changedCopies === 1 ? '1 value was changed' : `${changedCopies} values were changed`}
            </Text>
          ) : null}
        </View>

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
                {locked ? `${name} · copies` : name}
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
