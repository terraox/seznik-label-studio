import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import { Palette } from '@/constants/ui';
import type { ExcelParseOptions } from '@/lib/excel-rows';

type ExcelImportOptionsModalProps = {
  visible: boolean;
  fileName?: string;
  onCancel: () => void;
  onConfirm: (options: ExcelParseOptions) => void;
};

export function ExcelImportOptionsModal({
  visible,
  fileName,
  onCancel,
  onConfirm,
}: ExcelImportOptionsModalProps) {
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [startRowText, setStartRowText] = useState('2');
  const [startEdited, setStartEdited] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setHasHeaderRow(true);
    setStartRowText('2');
    setStartEdited(false);
  }, [visible]);

  const setHeader = (next: boolean) => {
    setHasHeaderRow(next);
    setStartRowText((current) => {
      if (startEdited) {
        const parsed = Number.parseInt(current, 10);
        const min = next ? 2 : 1;
        if (!Number.isFinite(parsed) || parsed < min) return String(min);
        return current;
      }
      return next ? '2' : '1';
    });
  };

  const confirm = () => {
    const dataStartRow = Number.parseInt(startRowText.trim(), 10);
    const min = hasHeaderRow ? 2 : 1;
    if (!Number.isFinite(dataStartRow) || dataStartRow < min) {
      Alert.alert(
        'Start row',
        hasHeaderRow
          ? 'When the first row has column names, data starts at row 2 or later.'
          : 'Enter a row number of 1 or later.',
      );
      return;
    }
    onConfirm({ hasHeaderRow, dataStartRow });
  };

  return (
    <IosAlertModal
      visible={visible}
      title="Excel rows"
      message={
        fileName
          ? `Choose which rows of “${fileName}” to print. Leave the start row as-is to use every data row.`
          : 'Choose which rows to print. Leave the start row as-is to use every data row.'
      }
      onClose={onCancel}
      buttons={[
        { text: 'Cancel', style: 'cancel', onPress: onCancel },
        { text: 'Import', style: 'default', bold: true, onPress: confirm },
      ]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>First row contains column names</Text>
        <Switch
          value={hasHeaderRow}
          onValueChange={setHeader}
          trackColor={{ false: '#E3E6EA', true: Palette.accent }}
        />
      </View>
      <Text style={styles.fieldLabel}>Start from row</Text>
      <IosAlertInput
        value={startRowText}
        onChangeText={(value) => {
          setStartEdited(true);
          setStartRowText(value.replace(/[^0-9]/g, ''));
        }}
        keyboardType="number-pad"
        placeholder={hasHeaderRow ? '2' : '1'}
      />
    </IosAlertModal>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginBottom: 12,
  },
  headerLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: '#1C1C1E',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 6,
  },
});
