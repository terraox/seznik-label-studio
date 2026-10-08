import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { KindBarcodeGlyph, KindQrGlyph, KindTextGlyph } from '@/components/excel-kind-icons';
import { ExcelLabelPreview } from '@/components/excel-label-preview';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import {
  createBulkLabelDocument,
  guessBulkSlotKind,
  type BulkColumnMapping,
  type BulkSlotKind,
} from '@/lib/bulk-labels';
import { clampLabelMm } from '@/lib/label-geometry';
import { useDataStore } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';

const TEAL = '#3EC6D0';

const KINDS: { id: BulkSlotKind; Glyph: typeof KindTextGlyph }[] = [
  { id: 'text', Glyph: KindTextGlyph },
  { id: 'barcode', Glyph: KindBarcodeGlyph },
  { id: 'qrcode', Glyph: KindQrGlyph },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function paramMm(value: string | string[] | undefined, fallback: number): number {
  const raw = firstParam(value);
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mappingsForColumns(columns: string[]): BulkColumnMapping[] {
  return columns.map((name, columnIndex) => ({
    columnIndex,
    include: true,
    kind: guessBulkSlotKind(name),
  }));
}

export default function ExcelBulkSetupScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    excelFileId?: string | string[];
    widthMm?: string | string[];
    heightMm?: string | string[];
    sheetIndex?: string | string[];
  }>();
  const excelFileId = firstParam(params.excelFileId);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const setActiveSheetIndex = useDataStore((s) => s.setActiveSheetIndex);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
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

  const [mappings, setMappings] = useState<BulkColumnMapping[]>(() =>
    mappingsForColumns(sheet?.columns ?? []),
  );
  const [displayHead, setDisplayHead] = useState(false);

  const columnCount = sheet?.columns.length ?? 0;
  const syncedMappings = useMemo(() => {
    if (mappings.length === columnCount) return mappings;
    return mappingsForColumns(sheet?.columns ?? []);
  }, [columnCount, mappings, sheet?.columns]);

  const includedCount = syncedMappings.filter((m) => m.include).length;
  const canConfirm = Boolean(file && sheet && includedCount > 0 && sheet.rows.length > 0);

  const patchMapping = (columnIndex: number, patch: Partial<BulkColumnMapping>) => {
    setMappings((prev) => {
      const base =
        prev.length === columnCount ? prev : mappingsForColumns(sheet?.columns ?? []);
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
    });
    if (!doc) {
      Alert.alert('Unable to create labels', 'Include at least one column.');
      return;
    }
    setActiveSheetIndex(file.id, sheetIndex);
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
            <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
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
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
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
                    setSheetIndex(index);
                    setMappings(mappingsForColumns(item.columns));
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

        {sheet.columns.map((name, columnIndex) => {
          const mapping = syncedMappings[columnIndex] ?? {
            columnIndex,
            include: true,
            kind: guessBulkSlotKind(name),
          };
          return (
            <View key={`${name}-${columnIndex}`} style={styles.columnCard}>
              <Pressable
                onPress={() => patchMapping(columnIndex, { include: !mapping.include })}
                hitSlop={6}
                style={styles.checkHit}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: mapping.include }}>
                <View style={[styles.check, mapping.include && styles.checkOn]}>
                  {mapping.include ? (
                    <AppIcon name="checkmark" tintColor="#FFFFFF" size={13} />
                  ) : null}
                </View>
              </Pressable>
              <Text style={styles.columnName} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.kindRow}>
                {KINDS.map(({ id, Glyph }) => (
                  <Pressable
                    key={id}
                    disabled={!mapping.include}
                    onPress={() => patchMapping(columnIndex, { kind: id })}
                    style={!mapping.include ? styles.kindOff : undefined}>
                    <Glyph active={mapping.include && mapping.kind === id} />
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
            trackColor={{ false: '#D1D5DB', true: TEAL }}
            thumbColor="#FFFFFF"
          />
        </View>
        <ExcelLabelPreview sheet={sheet} mappings={syncedMappings} displayHead={displayHead} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F8' },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: Palette.header,
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
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  headerAction: { minWidth: 72, alignItems: 'flex-end', paddingRight: 4 },
  confirmHeader: { color: '#FFFFFF', fontSize: 16, fontWeight: '400' },
  confirmHeaderOff: { color: 'rgba(255,255,255,0.4)' },
  body: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  bodyContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 10 },
  empty: { padding: Spacing.four, color: Palette.muted, textAlign: 'center' },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  chipOn: { backgroundColor: TEAL },
  chipText: { fontSize: 13, fontWeight: '600', color: Palette.ink },
  chipTextOn: { color: '#FFFFFF' },
  columnCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    minHeight: 54,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkHit: { paddingVertical: 8 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#C5CED6',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkOn: { backgroundColor: TEAL, borderColor: TEAL },
  columnName: { flex: 1, fontSize: 16, fontWeight: '400', color: '#334155' },
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
  displayHeadLabel: { fontSize: 15, color: '#64748B' },
  pressed: { opacity: 0.7 },
});
