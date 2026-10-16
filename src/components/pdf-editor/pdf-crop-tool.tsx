import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';

import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';
import type { SmartCropNotice, SmartCropStatus } from '@/components/pdf-editor/use-smart-crop';
import { parsePageRange, type OutputSize, type PageScope } from '@/lib/pdf-editor/session';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/** What the screen adds to the Smart Crop notices. */
export type PdfCropScreenNotice = never;

export type PdfCropSmart = {
  status: SmartCropStatus;
  notice: SmartCropNotice | PdfCropScreenNotice | null;
  selectedCount: number;
  /** Badge text of the single selected section, e.g. "Section 2 · 86%". */
  selectedLabel: string | null;
  hiddenCount: number;
  canStep: boolean;
  onSmartCrop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClear: () => void;
};

const NOTICE_TEXT: Record<SmartCropNotice | PdfCropScreenNotice, string> = {
  'none-found': "Couldn't find clear sections on this page. Tap a block, or switch to Manual Crop.",
  'low-confidence': 'The sections on this page are unclear. Tap a block, or switch to Manual Crop.',
  'nothing-here': 'Nothing to select there.',
  'big-block': 'This looks like one big block. Switch to Manual Crop to trim it.',
  capped: 'That block runs into most of the page, so its whole section was picked. Switch to Manual Crop to trim.',
  'too-small': "That's a very small block. Switch to Manual Crop to adjust.",
  'hint-step': 'Tap the same spot again to select the bigger block around it.',
  error: "Couldn't read this page for Smart Crop. Manual crop still works.",
};

export function PdfCropTool({
  scope,
  pageCount,
  hasCrop,
  selectionMm,
  outputSize,
  onScope,
  onResetCrop,
  onApplyCrop,
  onCancel,
  smart,
  kind = 'smart',
  onKind,
}: {
  scope: PageScope;
  pageCount: number;
  hasCrop?: boolean;
  /** Size of the drawn rectangle on the page, in mm. */
  selectionMm: { w: number; h: number } | null;
  outputSize: OutputSize;
  onScope: (scope: PageScope) => void;
  onResetCrop?: () => void;
  onApplyCrop: () => void;
  onCancel: () => void;
  /** Smart Crop controls. Absent = the plain manual crop panel. */
  smart?: PdfCropSmart;
  /** Which crop style is active. */
  kind?: 'smart' | 'manual';
  onKind?: (kind: 'smart' | 'manual') => void;
}) {
  useThemeRefresh();
  const rangeError =
    scope.mode === 'range' ? parsePageRange(String(scope.start), String(scope.end), pageCount).error : undefined;

  const reading = smart ? smart.status === 'loading' || smart.status === 'ready' : false;
  const fitsLabel = `${outputSize.widthMm} × ${outputSize.heightMm} mm`;

  return (
    <View style={styles.wrap}>
      {smart ? (
        <View style={styles.kindRow}>
          <Pressable
            onPress={onKind ? () => onKind('smart') : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === 'smart' }}
            accessibilityLabel="Smart Crop: finds the sections on the page, tap one to select it, then adjust its borders"
            style={({ pressed }) => [styles.kindBtn, kind === 'smart' && styles.kindOn, pressed && styles.pressed]}>
            <View style={styles.kindHead}>
              {reading && kind === 'smart' ? (
                <ActivityIndicator size="small" color={C.accentInk} />
              ) : (
                <AppIcon name="viewfinder" size={15} tintColor={kind === 'smart' ? C.accentInk : C.text} />
              )}
              <Text style={[styles.kindTitle, kind === 'smart' && styles.kindTitleOn]}>Smart Crop</Text>
            </View>
            <Text style={styles.kindDesc}>Finds sections. Tap one to crop to it.</Text>
          </Pressable>
          <Pressable
            onPress={onKind ? () => onKind('manual') : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === 'manual' }}
            accessibilityLabel="Manual Crop: drag the window yourself"
            style={({ pressed }) => [styles.kindBtn, kind === 'manual' && styles.kindOn, pressed && styles.pressed]}>
            <View style={styles.kindHead}>
              <AppIcon name="rectangle.dashed" size={15} tintColor={kind === 'manual' ? C.accentInk : C.text} />
              <Text style={[styles.kindTitle, kind === 'manual' && styles.kindTitleOn]}>Manual Crop</Text>
            </View>
            <Text style={styles.kindDesc}>Drag the window and its edges yourself.</Text>
          </Pressable>
        </View>
      ) : null}

      {smart && kind === 'smart' ? (
        <View style={styles.smartRow}>
          <Pressable
            onPress={smart.onSmartCrop}
            accessibilityRole="button"
            accessibilityLabel="Show all sections found on this page"
            style={({ pressed }) => [styles.smartBtn, pressed && styles.pressed]}>
            <Text style={styles.smartText}>Show all sections</Text>
          </Pressable>
          <Pressable
            onPress={smart.onPrev}
            disabled={!smart.canStep}
            accessibilityRole="button"
            accessibilityLabel="Previous section"
            hitSlop={4}
            style={({ pressed }) => [styles.stepBtn, !smart.canStep && styles.disabled, pressed && styles.pressed]}>
            <AppIcon name="chevron.left" size={16} tintColor={C.text} />
          </Pressable>
          <Pressable
            onPress={smart.onNext}
            disabled={!smart.canStep}
            accessibilityRole="button"
            accessibilityLabel="Next section"
            hitSlop={4}
            style={({ pressed }) => [styles.stepBtn, !smart.canStep && styles.disabled, pressed && styles.pressed]}>
            <AppIcon name="chevron.right" size={16} tintColor={C.text} />
          </Pressable>
        </View>
      ) : null}

      {smart && kind === 'smart' && smart.selectedCount > 0 ? (
        <View style={styles.chip}>
          <Text style={styles.chipText} numberOfLines={1}>
            {smart.selectedCount === 1
              ? smart.selectedLabel ?? '1 section selected'
              : `${smart.selectedCount} sections selected · window fits all`}
          </Text>
          <Pressable onPress={smart.onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear selection">
            <Text style={styles.chipClear}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {smart && kind === 'smart' && (smart.notice || smart.hiddenCount > 0) ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {smart.notice
            ? NOTICE_TEXT[smart.notice]
            : `${smart.hiddenCount} more small ${smart.hiddenCount === 1 ? 'block' : 'blocks'} hidden. Tap one to select it.`}
        </Text>
      ) : null}

      <View style={styles.row}>
        <View style={styles.sizeCell}>
          <Text style={styles.sizeValue} numberOfLines={1}>
            Label {fitsLabel}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onApplyCrop} style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}>
          <AppIcon name="checkmark" size={15} tintColor={C.onAccent} />
          <Text style={styles.applyText}>Done</Text>
        </Pressable>
        {hasCrop && onResetCrop ? (
          <Pressable onPress={onResetCrop} style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

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
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sizeCell: { flex: 1, gap: 1 },
  sizeValue: { fontSize: 14, fontWeight: '700', color: c.text },
  sizeSub: { fontSize: 11, color: c.textMuted },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: {
    flex: 1,
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  kindOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  kindHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindTitle: { fontSize: 14, fontWeight: '700', color: c.text },
  kindTitleOn: { color: c.accentInk },
  kindDesc: { fontSize: 11, color: c.textMuted },
  smartRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  smartText: { fontSize: 14, fontWeight: '700', color: c.accentInk },
  stepBtn: {
    width: 42,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  disabled: { opacity: 0.4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: c.accentSoft,
  },
  chipText: { flex: 1, fontSize: 13, fontWeight: '600', color: c.text },
  chipClear: { fontSize: 13, fontWeight: '700', color: c.accentInk },
  notice: { fontSize: 12, color: c.textSecondary },
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
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: c.accentFill,
    minHeight: 36,
    borderRadius: 10,
  },
  applyText: { color: c.onAccent, fontWeight: '700', fontSize: 14 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  removeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  removeText: { fontSize: 13, fontWeight: '600', color: c.danger },
  pressed: { opacity: 0.72 },
}));
