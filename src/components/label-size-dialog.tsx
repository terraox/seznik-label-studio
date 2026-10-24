import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { LabelSizeEditor } from '@/components/label-size-editor';
import { IosAlertModal } from '@/components/ui/ios-alert-modal';

import { clampLabelMm, validateLabelSize } from '@/lib/label-geometry';
import { stockSizePromptCopy, type StockSizeHandling } from '@/lib/stock-size';
import { themedStyles, useThemeRefresh } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

type LabelSizeDialogProps = {
  visible: boolean;
  /** Current label size. The dialog starts from it each time it opens. */
  widthMm: number;
  heightMm: number;
  /** Excel sets share one size, so the choice applies to every label. */
  isBulk: boolean;
  /** Round label: ask for a diameter instead of width and height. */
  circle?: boolean;
  onCancel: () => void;
  onApply: (widthMm: number, heightMm: number, mode: StockSizeHandling) => void;
};

/**
 * Label size popup. Apply opens a separate iOS-style alert that asks how existing elements
 * should follow the new size (keep as-is or scale).
 */
export function LabelSizeDialog({
  visible,
  widthMm,
  heightMm,
  isBulk,
  circle,
  onCancel,
  onApply,
}: LabelSizeDialogProps) {
  useThemeRefresh();
  const [draftW, setDraftW] = useState(widthMm);
  const [draftH, setDraftH] = useState(heightMm);
  const [pending, setPending] = useState<{ widthMm: number; heightMm: number } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraftW(widthMm);
    setDraftH(heightMm);
    setPending(null);
  }, [visible, widthMm, heightMm]);

  const size = clampLabelMm(draftW, draftH);
  const changed = Math.abs(size.widthMm - widthMm) >= 0.001 || Math.abs(size.heightMm - heightMm) >= 0.001;
  const invalid = validateLabelSize(draftW, draftH) != null;
  const canApply = changed && !invalid;
  const copy = stockSizePromptCopy(isBulk);

  return (
    <>
    <Modal supportedOrientations={ALL_ORIENTATIONS} visible={visible && !pending} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.overlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <FormScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          bounces={false}
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>{circle ? 'Label diameter' : 'Label size'}</Text>
              <Text style={styles.current}>
                {circle ? `Now ⌀ ${Math.min(widthMm, heightMm).toFixed(1)} mm` : `Now ${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm`}
              </Text>
            </View>

            <View style={styles.body}>
              <LabelSizeEditor
                widthMm={draftW}
                heightMm={draftH}
                circle={circle}
                onChange={(w, h) => {
                  setDraftW(w);
                  setDraftH(h);
                }}
              />
            </View>

            <View style={styles.footer}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={!canApply}
                onPress={() => setPending({ widthMm: size.widthMm, heightMm: size.heightMm })}
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
        </FormScrollView>
      </KeyboardAvoidingView>
    </Modal>

    <IosAlertModal
      visible={visible && pending != null}
      title={copy.title}
      message={copy.message}
      onClose={() => setPending(null)}
      buttons={[
        {
          text: 'Keep as-is',
          onPress: () => pending && onApply(pending.widthMm, pending.heightMm, 'keep'),
        },
        {
          text: 'Scale proportionally',
          bold: true,
          onPress: () => pending && onApply(pending.widthMm, pending.heightMm, 'scale'),
        },
        { text: 'Cancel', style: 'cancel', onPress: () => setPending(null) },
      ]}
    />
    </>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: c.surface,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: c.fill,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  title: { fontSize: 18, fontWeight: '700', color: c.text },
  current: { marginTop: 2, fontSize: 13, color: c.textMuted },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, gap: 16 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingTop: 12,
  },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
  btnGhost: { backgroundColor: c.fillStrong },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  btnPrimary: { backgroundColor: c.accentFill },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: c.onAccent },
  btnDisabled: { backgroundColor: c.textDisabled },
  pressed: { opacity: 0.8 },
}));
