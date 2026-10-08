import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabelSizeSetupSection } from '@/components/label-size-setup-section';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { useExcelImportFlow } from '@/lib/use-excel-import-flow';
import { clampLabelMm, validateLabelSize, type LabelUnit } from '@/lib/label-geometry';
import { useDataStore } from '@/stores/data-store';

/**
 * Dashboard Print Excel: label size, then the file picker, then column mapping.
 */
export default function ExcelPrintScreen() {
  const insets = useSafeAreaInsets();
  const addExcelFile = useDataStore((s) => s.addExcelFile);
  const { importExcel, excelImportModal, documentSourceSheet } = useExcelImportFlow();
  const [widthMm, setWidthMm] = useState(50);
  const [heightMm, setHeightMm] = useState(30);
  const [labelUnit, setLabelUnit] = useState<LabelUnit>('mm');
  const [picking, setPicking] = useState(false);

  const continueToFile = async () => {
    if (picking) return;
    const size = clampLabelMm(widthMm, heightMm);
    const error = validateLabelSize(size.widthMm, size.heightMm);
    if (error) {
      Alert.alert('Invalid size', error);
      return;
    }

    setPicking(true);
    try {
      const picked = await importExcel();
      if (!picked) return;

      const entry = addExcelFile({
        name: picked.name,
        uri: picked.uri,
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

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          disabled={picking}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Excel</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <LabelSizeSetupSection
          widthMm={widthMm}
          heightMm={heightMm}
          unit={labelUnit}
          onWidthChange={setWidthMm}
          onHeightChange={setHeightMm}
          onUnitChange={setLabelUnit}
        />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        <Pressable
          disabled={picking}
          onPress={() => void continueToFile()}
          style={({ pressed }) => [
            styles.continueBtn,
            picking && styles.continueBtnDisabled,
            pressed && !picking && styles.pressed,
          ]}>
          {picking ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.continueText}>Continue</Text>
          )}
        </Pressable>
      </View>

      {documentSourceSheet}
      {excelImportModal}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backChevron: { color: '#FFFFFF', fontSize: 32, fontWeight: '300', lineHeight: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
  },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14, gap: 12 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: Palette.screen,
  },
  continueBtn: {
    backgroundColor: Palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.7 },
  continueText: { color: '#FFFFFF', fontSize: 17, fontWeight: '500' },
  pressed: { opacity: 0.75 },
});
