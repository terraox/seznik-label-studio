import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path } from 'react-native-svg';

import { barcodeBarsForMode } from '@/lib/barcode-code128';
import { formatBarcodeHri } from '@/lib/barcode/hri';
import type { BulkColumnMapping } from '@/lib/bulk-labels';
import { Palette } from '@/constants/ui';
import type { ExcelSheet } from '@/stores/data-store';

type ExcelLabelPreviewProps = {
  sheet: ExcelSheet;
  mappings: BulkColumnMapping[];
  displayHead: boolean;
};

const BARCODE_INK = '#111111';

/** Same bar geometry the canvas uses: one filled run per bar, scaled to the box. */
function PreviewBarcode({ value }: { value: string }) {
  const content = value.trim();
  const barsPath = useMemo(() => {
    if (!content) return null;
    const bars = barcodeBarsForMode('CODE-128', content);
    if (!bars || bars.length === 0) return '';
    return bars
      .map((bar) => {
        const x = bar.x * 1000;
        const w = Math.max(bar.width * 1000, 0.55);
        return `M${x},0h${w}v100h-${w}Z`;
      })
      .join(' ');
  }, [content]);

  if (!content) return null;
  if (!barsPath) {
    return <Text allowFontScaling={false} style={styles.invalid}>Invalid barcode content</Text>;
  }

  return (
    <View style={styles.barcode}>
      <Svg width="100%" height={52} viewBox="0 0 1000 100" preserveAspectRatio="none">
        <Path d={barsPath} fill={BARCODE_INK} />
      </Svg>
      <Text allowFontScaling={false} style={styles.barcodeText} numberOfLines={1}>
        {formatBarcodeHri('CODE-128', content)}
      </Text>
    </View>
  );
}

export function ExcelLabelPreview({ sheet, mappings, displayHead }: ExcelLabelPreviewProps) {
  const included = mappings.filter((m) => m.include);
  const row = sheet.rows[0] ?? [];

  if (included.length === 0) {
    return (
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.empty}>Select at least one column</Text>
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
        const text = displayHead && value ? `${name}: ${value}` : value;
        return (
          <Text allowFontScaling={false} key={mapping.columnIndex} style={styles.text}>
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
    gap: 2,
  },
  barcodeText: {
    color: BARCODE_INK,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  invalid: { color: Palette.muted, fontSize: 13 },
  qrWrap: { marginTop: 4 },
});
