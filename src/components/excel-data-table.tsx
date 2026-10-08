import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Palette } from '@/constants/ui';

const COL_MIN_WIDTH = 112;

type ExcelDataTableProps = {
  columns: string[];
  rows: string[][];
};

export function ExcelDataTable({ columns, rows }: ExcelDataTableProps) {
  const { width: windowWidth } = useWindowDimensions();
  const fitWidth = Math.max(windowWidth - 24, 280);
  const colWidth = Math.max(COL_MIN_WIDTH, Math.floor(fitWidth / Math.max(columns.length, 1)));
  const tableWidth = Math.max(columns.length * colWidth, fitWidth);

  return (
    <ScrollView
      style={styles.vertical}
      contentContainerStyle={styles.verticalContent}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled">
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator>
        <View style={{ width: tableWidth }}>
          <View style={[styles.row, styles.headerRow]}>
            {columns.map((name, index) => (
              <View key={`h-${index}`} style={[styles.cell, styles.headerCell, { width: colWidth }]}>
                <Text style={styles.headerText}>{name}</Text>
              </View>
            ))}
          </View>
          {rows.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No matching rows</Text>
            </View>
          ) : (
            rows.map((row, rowIndex) => (
              <View key={`r-${rowIndex}`} style={[styles.row, rowIndex % 2 === 1 && styles.altRow]}>
                {columns.map((_, colIndex) => (
                  <View key={`c-${rowIndex}-${colIndex}`} style={[styles.cell, { width: colWidth }]}>
                    <Text style={styles.cellText}>{row[colIndex] ?? ''}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  vertical: { flex: 1 },
  verticalContent: { flexGrow: 1 },
  row: { flexDirection: 'row' },
  headerRow: { backgroundColor: '#FFFFFF' },
  altRow: { backgroundColor: '#F3F5F8' },
  cell: {
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  headerCell: { minHeight: 44 },
  headerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.ink,
    textAlign: 'center',
  },
  cellText: {
    fontSize: 13,
    color: Palette.ink,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyRow: { paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center' },
  emptyText: { fontSize: 14, color: Palette.muted },
});
