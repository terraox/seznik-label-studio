/**
 * SerialLabelScreen / serial-label.tsx
 *
 * Screen for the "Serial Labels" feature.
 * Step 1: collect the series details (pattern, range, barcode type).
 * Step 2 is the normal new-label size screen, which then opens the series on the canvas.
 */

import { goBack } from '@/lib/go-back';
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import {
  generateSerialLabelsFromSample,
  validateRange,
  GeneratedLabel,
  LabelTemplate,
  SequenceRuleConfig,
  BarcodeSymbology,
} from '@/lib/printer/SerialLabelEngine';
import { C, themedStyles, useThemeRefresh } from '@/theme';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const SYMBOLOGIES: { id: BarcodeSymbology; hint: string }[] = [
  { id: 'CODE128', hint: 'Best all-rounder. Letters and numbers.' },
  { id: 'CODE39', hint: 'Older style. Capital letters, numbers.' },
  { id: 'EAN13', hint: 'Retail. Exactly 12-13 digits.' },
  { id: 'UPCA', hint: 'Retail (US). Exactly 11-12 digits.' },
];

export default function SerialLabelScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();

  const [sampleText, setSampleText] = useState('Desk1');
  const [endNumber, setEndNumber] = useState('20');
  const [step, setStep] = useState('1');
  const [padding, setPadding] = useState(''); // blank = auto infer
  const [barcodeSymbology, setBarcodeSymbology] = useState<BarcodeSymbology>('CODE128');

  const template: LabelTemplate = {
    fields: {},
    textFieldKey: 'displayText',
    barcodeFieldKey: 'barcodeValue',
  };

  const startNumberMatch = sampleText.match(/(\d+)(\D*)$/);
  const startNumber = startNumberMatch ? parseInt(startNumberMatch[1], 10) : NaN;

  const { labels, problem } = useMemo(() => {
    if (!startNumberMatch) {
      return {
        labels: [] as GeneratedLabel[],
        problem: 'The first label needs a number in it, e.g. "Desk1" or "SN-001".',
      };
    }
    const cfg: SequenceRuleConfig = {
      startNumber,
      endNumber: Number(endNumber),
      step: Number(step) || 1,
      textPadding: padding ? Number(padding) : undefined,
      barcodeSymbology,
    };
    const rangeError = validateRange(cfg);
    if (rangeError) return { labels: [] as GeneratedLabel[], problem: rangeError };
    try {
      return { labels: generateSerialLabelsFromSample(sampleText, template, cfg), problem: null };
    } catch (e: unknown) {
      return {
        labels: [] as GeneratedLabel[],
        problem: e instanceof Error ? e.message : 'Could not generate the series.',
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleText, endNumber, step, padding, barcodeSymbology]);

  function handleNext() {
    if (problem || labels.length === 0) return;
    router.push({
      pathname: '/new-label-setup',
      params: {
        isSingleCanvas: 'true',
        serialSample: sampleText,
        serialEnd: endNumber,
        serialStep: step,
        serialPad: padding,
        serialSymbology: barcodeSymbology,
      },
    });
  }

  const shown =
    labels.length > 6 ? [...labels.slice(0, 3).map((l) => l.text), '…', labels[labels.length - 1].text] : labels.map((l) => l.text);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.navHeader}>
        <Pressable hitSlop={12} onPress={() => goBack()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor={C.text} size={20} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Serial Labels</Text>
        <View style={styles.connectIconBtn} />
      </View>

      <FormScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTag}>STEP 1 OF 2</Text>
        <Text style={styles.heading}>Serial details</Text>
        <Text style={styles.subheading}>
          Serial labels are a run of numbered labels, like Desk1, Desk2, Desk3. Fill in the details,
          then pick a label size and arrange the text and barcode on the canvas.
        </Text>

        <View style={styles.card}>
          <Field
            label="First label"
            hint="Type the first label exactly as you want it. The last number in it is what counts up. Examples: Desk1, SN-001, Bin 42B.">
            <TextInput
              style={styles.input}
              value={sampleText}
              onChangeText={setSampleText}
              placeholder="e.g. Desk1 or SN-001"
              placeholderTextColor={C.textMuted}
            />
          </Field>

          <Field
            label="Last number"
            hint="The number to stop at, included. Start 1 and last 20 makes 20 labels.">
            <TextInput
              style={styles.input}
              value={endNumber}
              onChangeText={setEndNumber}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor={C.textMuted}
            />
          </Field>

          <Field
            label="Count by"
            hint="How much the number goes up each label. 1 gives 1, 2, 3. 5 gives 5, 10, 15.">
            <TextInput
              style={styles.input}
              value={step}
              onChangeText={setStep}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={C.textMuted}
            />
          </Field>

          <Field
            label="Digits (leading zeros)"
            hint="Fixed number of digits. 3 gives 001, 002, 003. Leave empty to copy what you typed in First label.">
            <TextInput
              style={styles.input}
              value={padding}
              onChangeText={setPadding}
              keyboardType="numeric"
              placeholder="auto"
              placeholderTextColor={C.textMuted}
            />
          </Field>

          <Field
            label="Barcode type"
            hint="The barcode printed on each label carries the same number. Not sure? Keep CODE128.">
            <View style={styles.chipsRow}>
              {SYMBOLOGIES.map((sym) => (
                <TouchableOpacity
                  key={sym.id}
                  style={[styles.chip, barcodeSymbology === sym.id && styles.chipActive]}
                  onPress={() => setBarcodeSymbology(sym.id)}>
                  <Text style={barcodeSymbology === sym.id ? styles.chipTextActive : styles.chipText}>
                    {sym.id}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>
              {SYMBOLOGIES.find((s) => s.id === barcodeSymbology)?.hint}
            </Text>
          </Field>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>What you will get</Text>
          {problem ? (
            <Text style={styles.error}>{problem}</Text>
          ) : (
            <>
              <Text style={styles.summaryCount}>{labels.length} labels</Text>
              <View style={styles.pillsRow}>
                {shown.map((t, i) => (
                  <View key={`${i}-${t}`} style={styles.pill}>
                    <Text style={styles.pillText}>{t}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.hint}>
                Barcode on the first label will read {labels[0]?.barcodeValue}.
              </Text>
            </>
          )}
        </View>
      </FormScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, !!problem && styles.btnDisabled]}
          onPress={handleNext}
          disabled={!!problem}>
          <Text style={styles.buttonText}>Next: choose label size</Text>
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
  navTitle: { fontSize: 17, fontWeight: '700', color: c.text },
  connectIconBtn: { width: 60, alignItems: 'flex-end', justifyContent: 'center' },
  scrollContent: { padding: 16 },
  heading: { fontSize: 22, fontWeight: '800', color: c.text, marginBottom: 4 },
  subheading: { fontSize: 13, color: c.textSecondary, lineHeight: 18, marginBottom: 16 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: c.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 16,
  },
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
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
  error: { color: c.danger, marginTop: 10, fontSize: 13, fontWeight: '500' },
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
  buttonText: { color: c.onAccent, fontWeight: '700', fontSize: 15 },
  stepTag: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: c.link, marginBottom: 4 },
  field: { marginBottom: 14 },
  hint: { fontSize: 12, lineHeight: 16, color: c.textSecondary, marginTop: 6 },
  summary: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginBottom: 6 },
  summaryCount: { fontSize: 20, fontWeight: '800', color: c.text, marginBottom: 8 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { backgroundColor: c.fill, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 13, fontWeight: '700', color: c.text },
  footer: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
}));
