import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ExcelDataTable } from '@/components/excel-data-table';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { useDataStore } from '@/stores/data-store';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ExcelDataPreviewScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    excelFileId?: string | string[];
    widthMm?: string | string[];
    heightMm?: string | string[];
  }>();
  const excelFileId = firstParam(params.excelFileId);
  const excelFiles = useDataStore((s) => s.excelFiles);
  const setActiveSheetIndex = useDataStore((s) => s.setActiveSheetIndex);
  const file = excelFiles.find((f) => f.id === excelFileId) ?? null;
  const [sheetIndex, setSheetIndex] = useState(file?.activeSheetIndex ?? 0);
  const [query, setQuery] = useState('');
  const sheet = file ? file.sheets[sheetIndex] ?? file.sheets[0] ?? null : null;

  const filteredRows = useMemo(() => {
    if (!sheet) return [];
    const q = query.trim().toLowerCase();
    if (!q) return sheet.rows;
    return sheet.rows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(q)));
  }, [query, sheet]);

  const goToColumns = () => {
    if (!file || !sheet) return;
    setActiveSheetIndex(file.id, sheetIndex);
    router.push({
      pathname: '/excel-bulk-setup',
      params: {
        excelFileId: file.id,
        sheetIndex: String(sheetIndex),
        ...(firstParam(params.widthMm) ? { widthMm: firstParam(params.widthMm) } : {}),
        ...(firstParam(params.heightMm) ? { heightMm: firstParam(params.heightMm) } : {}),
      },
    });
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
          <Text style={styles.headerTitle}>Data File</Text>
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
        <Text style={styles.headerTitle}>Data File</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.sheet}>
        <View style={styles.searchRow}>
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            style={({ pressed }) => [styles.refreshHit, pressed && styles.pressed]}>
            <AppIcon name="arrow.clockwise" tintColor={Palette.accent} size={20} />
          </Pressable>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Data"
            placeholderTextColor={Palette.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.scanHit}>
            <AppIcon name="viewfinder" tintColor={Palette.accent} size={22} />
          </View>
        </View>

        {file.sheets.length > 1 ? (
          <View style={styles.sheetChips}>
            {file.sheets.map((item, index) => {
              const active = index === sheetIndex;
              return (
                <Pressable
                  key={`${item.name}-${index}`}
                  onPress={() => {
                    setSheetIndex(index);
                    setQuery('');
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

        <View style={styles.tableWrap}>
          <ExcelDataTable columns={sheet.columns} rows={filteredRows} />
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <View style={styles.footerSplit} />
          <Pressable
            onPress={goToColumns}
            style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.header },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
    minHeight: 52,
  },
  headerBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  empty: { padding: 24, color: '#FFFFFF', textAlign: 'center' },
  sheet: {
    flex: 1,
    backgroundColor: Palette.screen,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  refreshHit: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  scanHit: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, fontSize: 15, color: Palette.ink, paddingVertical: 0 },
  sheetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  chipOn: { backgroundColor: Palette.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: Palette.ink },
  chipTextOn: { color: '#FFFFFF' },
  tableWrap: {
    flex: 1,
    marginHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  footerBtn: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  footerSplit: { width: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0' },
  cancelText: { fontSize: 17, fontWeight: '600', color: '#2563EB' },
  confirmText: { fontSize: 17, fontWeight: '600', color: '#DC2626' },
  pressed: { opacity: 0.7 },
});
