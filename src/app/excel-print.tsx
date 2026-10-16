import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabelSizeSetupSection } from '@/components/label-size-setup-section';
import { Spacing } from '@/constants/theme';

import { useExcelImportFlow } from '@/lib/use-excel-import-flow';
import { clampLabelMm, validateLabelSize, type LabelUnit } from '@/lib/label-geometry';
import { stageImportedFile } from '@/lib/user-files/stage-import';
import { useDataStore } from '@/stores/data-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/**
 * Dashboard Print Excel: label size, then the file picker, then column mapping.
 */
export default function ExcelPrintScreen() {
  useThemeRefresh();
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
          onSizeChange={(w, h) => {
            setWidthMm(w);
            setHeightMm(h);
          }}
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
            <ActivityIndicator color={C.onAccent} />
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: c.onAccent,
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
    backgroundColor: c.bg,
  },
  continueBtn: {
    backgroundColor: c.accentFill,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.7 },
  continueText: { color: c.onAccent, fontSize: 17, fontWeight: '500' },
  pressed: { opacity: 0.75 },
}));
