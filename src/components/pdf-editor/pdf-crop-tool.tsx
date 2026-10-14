import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';
import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';
import { parsePageRange, type OutputSize, type PageScope } from '@/lib/pdf-editor/session';

export function PdfCropTool({
  scope,
  pageCount,
  hasCrop,
  selectionMm,
  outputSize,
  onScope,
  matchLabel,
  onMatchLabel,
  onResetCrop,
  onApplyCrop,
  onCancel,
}: {
  scope: PageScope;
  pageCount: number;
  hasCrop?: boolean;
  /** Size of the drawn rectangle on the page, in mm. */
  selectionMm: { w: number; h: number } | null;
  outputSize: OutputSize;
  onScope: (scope: PageScope) => void;
  matchLabel: boolean;
  onMatchLabel: (on: boolean) => void;
  onResetCrop?: () => void;
  onApplyCrop: () => void;
  onCancel: () => void;
}) {
  const rangeError =
    scope.mode === 'range' ? parsePageRange(String(scope.start), String(scope.end), pageCount).error : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.infoRow}>
        <View style={styles.infoCell}>
          <Text style={styles.infoLabel}>Selected area</Text>
          <Text style={styles.infoValue}>
            {selectionMm ? `${selectionMm.w.toFixed(1)} × ${selectionMm.h.toFixed(1)} mm` : '-'}
          </Text>
        </View>
        <AppIcon name="arrow.right.to.line" size={14} tintColor="#94A3B8" />
        <View style={styles.infoCell}>
          <Text style={styles.infoLabel}>Fits label</Text>
          <Text style={styles.infoValue}>
            {outputSize.widthMm} × {outputSize.heightMm} mm
          </Text>
        </View>
      </View>

      <View style={styles.matchRow}>
        <View style={styles.matchText}>
          <Text style={styles.matchTitle}>Match label shape</Text>
          <Text style={styles.matchSub}>
            {matchLabel ? 'Locked to the label shape, so the crop fills the label.' : 'Off: width and height crop freely.'}
          </Text>
        </View>
        <Switch value={matchLabel} onValueChange={onMatchLabel} trackColor={{ true: Palette.accent }} />
      </View>

      <View style={styles.actionRow}>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onApplyCrop} style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}>
          <AppIcon name="checkmark" size={15} tintColor="#FFFFFF" />
          <Text style={styles.applyText}>Apply Crop</Text>
        </Pressable>
      </View>
      {hasCrop && onResetCrop ? (
        <Pressable onPress={onResetCrop} hitSlop={6} style={styles.resetBtn}>
          <Text style={styles.resetText}>Remove crop (use full page)</Text>
        </Pressable>
      ) : null}

      <PdfScopeSelector
        scope={scope}
        pageCount={pageCount}
        rangeError={rangeError}
        onChange={(next) => {
          if (next.mode === 'range') {
            const parsed = parsePageRange(String(next.start), String(next.end), pageCount);
            onScope({ mode: 'range', start: parsed.start, end: parsed.end });
            return;
          }
          onScope(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoCell: { flex: 1, gap: 1 },
  infoLabel: { fontSize: 11, color: Palette.muted },
  infoValue: { fontSize: 14, fontWeight: '700', color: Palette.ink },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchText: { flex: 1, gap: 1 },
  matchTitle: { fontSize: 14, fontWeight: '600', color: Palette.ink },
  matchSub: { fontSize: 11, color: Palette.muted },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applyBtn: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.accent,
    minHeight: 42,
    borderRadius: 10,
  },
  applyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  resetBtn: { alignSelf: 'center', paddingVertical: 2 },
  resetText: { fontSize: 12, fontWeight: '600', color: Palette.danger },
  pressed: { opacity: 0.72 },
});
