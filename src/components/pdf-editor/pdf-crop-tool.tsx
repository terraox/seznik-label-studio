import { Pressable, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';

import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';
import { parsePageRange, type OutputSize, type PageScope } from '@/lib/pdf-editor/session';
import { C, themedStyles, useThemeRefresh } from '@/theme';

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
  useThemeRefresh();
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
        <AppIcon name="arrow.right.to.line" size={14} tintColor={C.textMuted} />
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
        <Switch value={matchLabel} onValueChange={onMatchLabel} trackColor={{ true: C.accent }} />
      </View>

      <View style={styles.actionRow}>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onApplyCrop} style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}>
          <AppIcon name="checkmark" size={15} tintColor={C.onAccent} />
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

const styles = themedStyles((c) => ({
  wrap: { gap: 10 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: c.fill,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.hairline,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoCell: { flex: 1, gap: 1 },
  infoLabel: { fontSize: 11, color: c.textMuted },
  infoValue: { fontSize: 14, fontWeight: '700', color: c.text },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchText: { flex: 1, gap: 1 },
  matchTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  matchSub: { fontSize: 11, color: c.textMuted },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applyBtn: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: c.accentFill,
    minHeight: 42,
    borderRadius: 10,
  },
  applyText: { color: c.onAccent, fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  resetBtn: { alignSelf: 'center', paddingVertical: 2 },
  resetText: { fontSize: 12, fontWeight: '600', color: c.danger },
  pressed: { opacity: 0.72 },
}));
