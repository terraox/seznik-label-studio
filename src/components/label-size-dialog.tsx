import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { LabelSizeEditor } from '@/components/label-size-editor';
import { Palette } from '@/constants/ui';
import { clampLabelMm, validateLabelSize } from '@/lib/label-geometry';
import { stockSizePromptCopy, type StockSizeHandling } from '@/lib/stock-size';

type LabelSizeDialogProps = {
  visible: boolean;
  /** Current label size. The dialog starts from it each time it opens. */
  widthMm: number;
  heightMm: number;
  /** Excel sets share one size, so the choice applies to every label. */
  isBulk: boolean;
  onCancel: () => void;
  onApply: (widthMm: number, heightMm: number, mode: StockSizeHandling) => void;
};

const MODES: { id: StockSizeHandling; title: string; hint: string }[] = [
  { id: 'keep', title: 'Keep as-is', hint: 'Elements keep their size and only move onto the new stock.' },
  { id: 'scale', title: 'Scale', hint: 'Elements resize in proportion to the new label.' },
];

/**
 * Label size popup. Size fields and the keep/scale choice live in one sheet, so changing the
 * stock is a single Apply instead of Done followed by a system alert.
 */
export function LabelSizeDialog({
  visible,
  widthMm,
  heightMm,
  isBulk,
  onCancel,
  onApply,
}: LabelSizeDialogProps) {
  const [draftW, setDraftW] = useState(widthMm);
  const [draftH, setDraftH] = useState(heightMm);
  const [mode, setMode] = useState<StockSizeHandling>('keep');

  useEffect(() => {
    if (!visible) return;
    setDraftW(widthMm);
    setDraftH(heightMm);
    setMode('keep');
  }, [visible, widthMm, heightMm]);

  const size = clampLabelMm(draftW, draftH);
  const changed = Math.abs(size.widthMm - widthMm) >= 0.001 || Math.abs(size.heightMm - heightMm) >= 0.001;
  const invalid = validateLabelSize(draftW, draftH) != null;
  const canApply = changed && !invalid;
  const copy = stockSizePromptCopy(isBulk);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          bounces={false}
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Label size</Text>
              <Text style={styles.current}>
                Now {widthMm.toFixed(1)} × {heightMm.toFixed(1)} mm
              </Text>
            </View>

            <View style={styles.body}>
              <LabelSizeEditor
                widthMm={draftW}
                heightMm={draftH}
                onChange={(w, h) => {
                  setDraftW(w);
                  setDraftH(h);
                }}
              />

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {isBulk ? 'Existing elements, every label' : 'Existing elements'}
                </Text>
                <View style={styles.segment}>
                  {MODES.map((option) => {
                    const on = option.id === mode;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setMode(option.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [
                          styles.segmentBtn,
                          on && styles.segmentBtnOn,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>
                  {MODES.find((option) => option.id === mode)?.hint}
                  {isBulk ? ` ${copy.message}` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.footer}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={!canApply}
                onPress={() => onApply(size.widthMm, size.heightMm, mode)}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnPrimary,
                  !canApply && styles.btnDisabled,
                  pressed && canApply && styles.pressed,
                ]}>
                <Text style={styles.btnPrimaryText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 30, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: Palette.card,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Palette.cardTop,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.hairline,
  },
  title: { fontSize: 18, fontWeight: '700', color: Palette.ink },
  current: { marginTop: 2, fontSize: 13, color: Palette.muted },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, gap: 16 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: Palette.muted, textTransform: 'uppercase' },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#EEF2F6',
    gap: 3,
  },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  segmentBtnOn: { backgroundColor: Palette.card, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segmentText: { fontSize: 14, fontWeight: '500', color: Palette.actionText },
  segmentTextOn: { color: Palette.accent, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17, color: Palette.muted },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingTop: 12,
  },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
  btnGhost: { backgroundColor: '#EEF2F6' },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: Palette.actionText },
  btnPrimary: { backgroundColor: Palette.accent },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  btnDisabled: { backgroundColor: Palette.disabled },
  pressed: { opacity: 0.8 },
});
