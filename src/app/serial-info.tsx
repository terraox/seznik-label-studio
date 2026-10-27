/**
 * Serial Labels, step 2 of 3 (label size, then this screen, then the editor).
 * The user says what the first label is, how many to make and what goes on each one
 * (text, barcode, QR code). A live preview shows the labels; "Open editor" builds the label and
 * opens it on the canvas, where everything can still be moved and resized.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { LabelPreview } from '@/components/label-preview';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';
import { goBack } from '@/lib/go-back';
import { clampLabelMm } from '@/lib/label-geometry';
import {
  buildSerialLabelDocument,
  DEFAULT_SERIAL_INFO,
  SERIAL_BARCODE_TYPES,
  type SerialInfoOptions,
} from '@/lib/serial/build-document';
import { resolveDocumentForIndex } from '@/lib/serial/resolve-document';
import { MAX_SERIAL_BATCH } from '@/lib/serial/types';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function Toggle({ label, icon, on, onPress }: { label: string; icon: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.toggle, on && styles.toggleOn]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}>
      <AppIcon name={on ? 'checkmark.circle.fill' : icon} tintColor={on ? C.onAccent : C.textSecondary} size={18} />
      <Text style={on ? styles.toggleTextOn : styles.toggleText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function SerialInfoScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ name?: string; widthMm?: string; heightMm?: string }>();
  const defaults = useSettingsStore((s) => s.defaults);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);

  const size = clampLabelMm(Number(firstParam(params.widthMm)) || 50, Number(firstParam(params.heightMm)) || 30);
  const name = firstParam(params.name) || 'Serial labels';

  const [sample, setSample] = useState(DEFAULT_SERIAL_INFO.sample);
  const [count, setCount] = useState(String(DEFAULT_SERIAL_INFO.count));
  const [step, setStep] = useState('1');
  const [digits, setDigits] = useState('');
  const [showText, setShowText] = useState(true);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [barcodeType, setBarcodeType] = useState<SerialInfoOptions['barcodeType']>('CODE-128');
  const [moreOpen, setMoreOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const countNum = Math.floor(Number(count));
  const countOk = Number.isFinite(countNum) && countNum >= 1 && countNum <= MAX_SERIAL_BATCH;

  const built = useMemo(
    () =>
      buildSerialLabelDocument({
        name,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
        autoWrap: defaults.autoWrap,
        options: {
          sample: sample.trim() || DEFAULT_SERIAL_INFO.sample,
          count: countOk ? countNum : 1,
          step: Number(step) || 1,
          digits: digits ? Number(digits) : undefined,
          showText,
          showBarcode,
          showQr,
          barcodeType,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, size.widthMm, size.heightMm, sample, countNum, countOk, step, digits, showText, showBarcode, showQr, barcodeType],
  );

  const total = countOk ? countNum : 1;
  const idx = Math.min(Math.max(0, previewIndex), total - 1);
  const previewDoc = useMemo(() => resolveDocumentForIndex(built.doc, idx), [built.doc, idx]);

  const errors = built.issues.filter((i) => i.severity === 'error');
  const warnings = built.issues.filter((i) => i.severity === 'warning');
  const problem = !countOk
    ? `How many must be a whole number from 1 to ${MAX_SERIAL_BATCH}.`
    : errors[0]?.message ?? null;

  // Last toggle cannot be switched off: a label needs something on it.
  const onlyOne = [showText, showBarcode, showQr].filter(Boolean).length === 1;
  const flip = (on: boolean, set: (v: boolean) => void) => {
    if (on && onlyOne) return;
    set(!on);
  };

  function openEditor() {
    if (problem) return;
    upsertDocument(built.doc);
    router.replace({ pathname: '/edit', params: { labelId: built.doc.id } });
  }

  const previewWidth = Math.max(120, windowWidth - 32 - 32);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.navHeader}>
        <Pressable hitSlop={12} onPress={() => goBack()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor={C.text} size={20} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Serial Labels</Text>
        <View style={styles.backBtn} />
      </View>

      <FormScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTag}>STEP 2 OF 3</Text>
        <Text style={styles.heading}>What goes on the labels</Text>
        <Text style={styles.subheading}>
          {size.widthMm} × {size.heightMm} mm. You can move and resize everything in the editor next.
        </Text>

        <View style={styles.previewCard}>
          <View style={styles.previewStage}>
            <LabelPreview document={previewDoc} width={previewWidth} maxHeight={190} showArtboardBorder />
          </View>
          <View style={styles.pager}>
            <Pressable
              hitSlop={10}
              disabled={idx <= 0}
              onPress={() => setPreviewIndex(idx - 1)}
              style={[styles.pagerBtn, idx <= 0 && styles.pagerOff]}>
              <AppIcon name="chevron.left" tintColor={C.text} size={18} />
            </Pressable>
            <Text style={styles.pagerText}>
              Label {idx + 1} of {total}
            </Text>
            <Pressable
              hitSlop={10}
              disabled={idx >= total - 1}
              onPress={() => setPreviewIndex(idx + 1)}
              style={[styles.pagerBtn, idx >= total - 1 && styles.pagerOff]}>
              <AppIcon name="chevron.right" tintColor={C.text} size={18} />
            </Pressable>
          </View>
          {built.range ? (
            <Text style={styles.rangeText}>
              {built.range.first} → {built.range.last}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Starts with</Text>
            <TextInput
              style={styles.input}
              value={sample}
              onChangeText={setSample}
              placeholder="e.g. Desk1 or SN-001"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
            />
            <Text style={styles.hint}>The last number in it counts up. Desk1, SN-001, Bin 42B.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>How many labels</Text>
            <TextInput
              style={styles.input}
              value={count}
              onChangeText={(t) => {
                setCount(t.replace(/[^0-9]/g, ''));
                setPreviewIndex(0);
              }}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor={C.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Show on label</Text>
            <View style={styles.toggleRow}>
              <Toggle label="Text" icon="textformat" on={showText} onPress={() => flip(showText, setShowText)} />
              <Toggle label="Barcode" icon="barcode" on={showBarcode} onPress={() => flip(showBarcode, setShowBarcode)} />
              <Toggle label="QR code" icon="qrcode" on={showQr} onPress={() => flip(showQr, setShowQr)} />
            </View>
            {showBarcode ? (
              <>
                <View style={[styles.chipsRow, { marginTop: 10 }]}>
                  {SERIAL_BARCODE_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.chip, barcodeType === t.id && styles.chipActive]}
                      onPress={() => setBarcodeType(t.id)}>
                      <Text style={barcodeType === t.id ? styles.chipTextActive : styles.chipText}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.hint}>{SERIAL_BARCODE_TYPES.find((t) => t.id === barcodeType)?.hint}</Text>
              </>
            ) : null}
            {(showBarcode || showQr) && (
              <Text style={styles.hint}>
                {[showText && 'Text', showBarcode && 'barcode', showQr && 'QR code']
                  .filter(Boolean)
                  .join(', ')}{' '}
                all show the same number.
              </Text>
            )}
          </View>

          <Pressable style={styles.moreRow} onPress={() => setMoreOpen((v) => !v)}>
            <Text style={styles.moreText}>More options</Text>
            <AppIcon name={moreOpen ? 'chevron.up' : 'chevron.down'} tintColor={C.textSecondary} size={16} />
          </Pressable>
          {moreOpen ? (
            <View style={{ marginTop: 10 }}>
              <View style={styles.field}>
                <Text style={styles.label}>Count by</Text>
                <TextInput
                  style={styles.input}
                  value={step}
                  onChangeText={setStep}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor={C.textMuted}
                />
                <Text style={styles.hint}>1 gives 1, 2, 3. 5 gives 5, 10, 15.</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Digits (leading zeros)</Text>
                <TextInput
                  style={styles.input}
                  value={digits}
                  onChangeText={(t) => setDigits(t.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  placeholder="auto"
                  placeholderTextColor={C.textMuted}
                />
                <Text style={styles.hint}>3 gives 001, 002, 003. Empty copies the zeros you typed.</Text>
              </View>
            </View>
          ) : null}
        </View>

        {problem ? <Text style={styles.error}>{problem}</Text> : null}
        {!problem
          ? warnings.slice(0, 2).map((w, i) => (
              <Text key={i} style={styles.warning}>
                {w.message}
              </Text>
            ))
          : null}
      </FormScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, !!problem && styles.btnDisabled]}
          onPress={() => (problem ? Alert.alert('Serial labels', problem) : openEditor())}>
          <Text style={styles.buttonText}>Open editor</Text>
          <AppIcon name="chevron.right" tintColor={C.onAccent} size={18} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.fill },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    backgroundColor: c.surface,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backText: { fontSize: 16, color: c.text, fontWeight: '500' },
  navTitle: { fontSize: 17, fontWeight: '700', color: c.text, flexShrink: 1 },
  scrollContent: { padding: 16 },
  stepTag: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: c.link, marginBottom: 4 },
  heading: { fontSize: 22, fontWeight: '800', color: c.text, marginBottom: 4 },
  subheading: { fontSize: 13, color: c.textSecondary, lineHeight: 18, marginBottom: 16 },
  previewCard: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  previewStage: { alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  pagerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fill },
  pagerOff: { opacity: 0.35 },
  pagerText: { fontSize: 14, fontWeight: '700', color: c.text, minWidth: 120, textAlign: 'center', flexShrink: 1 },
  rangeText: { fontSize: 12, color: c.textSecondary, marginTop: 6 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 6 },
  input: {
    backgroundColor: c.fill,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
  },
  hint: { fontSize: 12, lineHeight: 16, color: c.textSecondary, marginTop: 6 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.fill,
  },
  toggleOn: { backgroundColor: '#2563EB', borderColor: c.link }, // theme-fixed: blue selected, white text
  toggleText: { fontSize: 13, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },
  toggleTextOn: { fontSize: 13, fontWeight: '700', color: c.onAccent, flexShrink: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.fill,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: '#2563EB', borderColor: c.link }, // theme-fixed: blue selected chip, white text
  chipText: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: c.onAccent, fontSize: 13, fontWeight: '600' },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  moreText: { fontSize: 14, fontWeight: '700', color: c.link },
  error: { color: c.danger, fontSize: 13, fontWeight: '500', marginBottom: 8 },
  warning: { color: c.textSecondary, fontSize: 12, lineHeight: 16, marginBottom: 8 },
  button: {
    backgroundColor: '#2563EB', // theme-fixed: blue button, white text
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnDisabled: { opacity: 0.5 },
  buttonText: { color: c.onAccent, fontWeight: '700', fontSize: 15, flexShrink: 1 },
  footer: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
}));
