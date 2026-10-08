import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { barcodeModulesForMode } from '@/lib/barcode-code128';
import type { BulkColumnMapping } from '@/lib/bulk-labels';
import { Palette } from '@/constants/ui';
import type { ExcelSheet } from '@/stores/data-store';

type ExcelLabelPreviewProps = {
  sheet: ExcelSheet;
  mappings: BulkColumnMapping[];
  displayHead: boolean;
};

function PreviewBarcode({ value }: { value: string }) {
  const units = useMemo(() => {
    const modules = barcodeModulesForMode('CODE-128', value.trim() || '12345678');
    if (!modules || modules.length === 0) return [1, 1, 1, 1, 1, 1];
    const next: boolean[] = [];
    let bar = true;
    for (const width of modules) {
      for (let i = 0; i < width; i++) next.push(bar);
      bar = !bar;
    }
    return next;
  }, [value]);

  return (
    <View style={styles.barcode}>
      {units.map((on, i) => (
        <View key={i} style={[styles.barcodeUnit, on ? styles.barcodeOn : styles.barcodeOff]} />
      ))}
    </View>
  );
}

export function ExcelLabelPreview({ sheet, mappings, displayHead }: ExcelLabelPreviewProps) {
  const included = mappings.filter((m) => m.include);
  const row = sheet.rows[0] ?? [];

  if (included.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>Select at least one column</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {included.map((mapping) => {
        const name = sheet.columns[mapping.columnIndex] ?? '';
        const value = String(row[mapping.columnIndex] ?? '');
        if (mapping.kind === 'barcode') {
          return <PreviewBarcode key={mapping.columnIndex} value={value} />;
        }
        if (mapping.kind === 'qrcode') {
          return (
            <View key={mapping.columnIndex} style={styles.qrWrap}>
              <QRCode value={value.trim() || ' '} size={92} color="#111111" backgroundColor="#FFFFFF" />
            </View>
          );
        }
        const text = displayHead && value ? `${name}: ${value}` : value;
        return (
          <Text key={mapping.columnIndex} style={styles.text}>
            {text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 168,
    gap: 8,
  },
  empty: { color: Palette.muted, fontSize: 14 },
  text: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  barcode: {
    width: '100%',
    height: 78,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  barcodeUnit: { flex: 1, minWidth: 1 },
  barcodeOn: { backgroundColor: '#111111' },
  barcodeOff: { backgroundColor: 'transparent' },
  qrWrap: { marginTop: 4 },
});
