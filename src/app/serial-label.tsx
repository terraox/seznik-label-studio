/**
 * SerialLabelScreen / serial-label.tsx
 *
 * Screen for the "Serial Labels" feature.
 * Generates a numbered series from a sample pattern, then opens that series
 * on the editor canvas so layout and print use the normal label pipeline.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { validateLabelSize } from '@/lib/label-geometry';
import {
  generateSerialLabelsFromSample,
  validateRange,
  GeneratedLabel,
  LabelTemplate,
  SequenceRuleConfig,
  BarcodeSymbology,
} from '@/lib/printer/SerialLabelEngine';
import { createSerialLabelDocument, serialDocumentName } from '@/lib/serial-label-document';
import { useDataStore } from '@/stores/data-store';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { C, themedStyles, useThemeRefresh } from '@/theme';

function LabelPreview({
  item,
  widthMm,
  heightMm,
}: {
  item: GeneratedLabel;
  widthMm: string;
  heightMm: string;
}) {
  useThemeRefresh();
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewIndex}>#{item.index + 1}</Text>
        <Text style={styles.previewDim}>
          {widthMm}×{heightMm}mm
        </Text>
      </View>
      <Text style={styles.previewText}>{item.text}</Text>
      <View style={styles.barcodeBox}>
        <Text style={styles.barcodeBars}>||| | |||| | || ||| |</Text>
        <Text style={styles.barcodeText}>{item.barcodeValue}</Text>
      </View>
    </View>
  );
}

export default function SerialLabelScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const addExcelFile = useDataStore((s) => s.addExcelFile);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const defaults = useSettingsStore((s) => s.defaults);

  const [sampleText, setSampleText] = useState('Desk1');
  const [endNumber, setEndNumber] = useState('20');
  const [step, setStep] = useState('1');
  const [padding, setPadding] = useState(''); // blank = auto infer
  const [widthMm, setWidthMm] = useState('50');
  const [heightMm, setHeightMm] = useState('30');
  const [barcodeSymbology, setBarcodeSymbology] = useState<BarcodeSymbology>('CODE128');
  const [generated, setGenerated] = useState<GeneratedLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const template: LabelTemplate = {
    fields: {},
    textFieldKey: 'displayText',
    barcodeFieldKey: 'barcodeValue',
  };

  const startNumberMatch = sampleText.match(/(\d+)(\D*)$/);
  const startNumber = startNumberMatch ? parseInt(startNumberMatch[1], 10) : NaN;

  const rangeError = useMemo(() => {
    if (!startNumberMatch) return 'Sample label needs a number, e.g. "Desk1" or "SN-001".';
    const cfg: SequenceRuleConfig = {
      startNumber,
      endNumber: Number(endNumber),
      step: Number(step) || 1,
      textPadding: padding ? Number(padding) : undefined,
      barcodeSymbology,
    };
    return validateRange(cfg);
  }, [sampleText, endNumber, step, padding, barcodeSymbology, startNumberMatch, startNumber]);

  function sequenceConfig(): SequenceRuleConfig {
    return {
      startNumber,
      endNumber: Number(endNumber),
      step: Number(step) || 1,
      textPadding: padding ? Number(padding) : undefined,
      barcodeSymbology,
    };
  }

  function buildSequence(): GeneratedLabel[] | null {
    try {
      const labels = generateSerialLabelsFromSample(sampleText, template, sequenceConfig());
      setGenerated(labels);
      setError(null);
      return labels;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not generate the series.';
      setError(message);
      setGenerated([]);
      return null;
    }
  }

  function handlePreview() {
    setError(null);
    buildSequence();
  }

  function handleOpenInCanvas() {
    if (opening || rangeError) return;
    const sizeError = validateLabelSize(Number(widthMm), Number(heightMm));
    if (sizeError) {
      Alert.alert('Label size', sizeError);
      return;
    }

    const labels = buildSequence();
    if (!labels || labels.length === 0) {
      Alert.alert('Serial labels', error ?? rangeError ?? 'Generate a valid series first.');
      return;
    }

    setOpening(true);
    try {
      const file = addExcelFile({
        name: serialDocumentName(labels),
        uri: `serial://label/${Date.now()}`,
        sheets: [
          {
            name: 'Serial',
            columns: ['Text', 'Barcode'],
            rows: labels.map((label) => [label.text, label.barcodeValue]),
          },
        ],
        activeSheetIndex: 0,
        hasHeaderRow: true,
        dataStartRow: 1,
      });
      const doc = createSerialLabelDocument({
        labels,
        excelFileId: file.id,
        widthMm: Number(widthMm),
        heightMm: Number(heightMm),
        barcodeSymbology,
        orientation: defaults.orientation,
        paperType: defaults.paperType,
      });
      if (!doc) {
        Alert.alert('Serial labels', 'The series could not be opened on the canvas.');
        return;
      }
      upsertDocument(doc);
      router.replace({ pathname: '/edit', params: { labelId: doc.id } });
    } catch (e: unknown) {
      Alert.alert('Serial labels', e instanceof Error ? e.message : 'Could not open the canvas.');
    } finally {
      setOpening(false);
    }
  }

  const previewSlice =
    generated.length > 8
      ? [...generated.slice(0, 4), ...generated.slice(-4)]
      : generated;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.navHeader}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backBtn}>
          <AppIcon name="chevron.left" tintColor={C.text} size={20} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Serial Labels</Text>
        <View style={styles.connectIconBtn} />
      </View>

      <FormScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Serial Label Generator</Text>
        <Text style={styles.subheading}>
          Set the pattern, range, and size. The series opens on the canvas so you can place text
          and barcode, then print every label.
        </Text>

        {/* Configuration Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sequence Configuration</Text>

          <Text style={styles.label}>Sample Label Pattern</Text>
          <TextInput
            style={styles.input}
            value={sampleText}
            onChangeText={setSampleText}
            placeholder="e.g. Desk1 or SN-001"
            placeholderTextColor={C.textMuted}
          />

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>End Number</Text>
              <TextInput
                style={styles.input}
                value={endNumber}
                onChangeText={setEndNumber}
                keyboardType="numeric"
                placeholder="20"
                placeholderTextColor={C.textMuted}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Step</Text>
              <TextInput
                style={styles.input}
                value={step}
                onChangeText={setStep}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor={C.textMuted}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Zero-Pad</Text>
              <TextInput
                style={styles.input}
                value={padding}
                onChangeText={setPadding}
                keyboardType="numeric"
                placeholder="auto"
                placeholderTextColor={C.textMuted}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Width (mm)</Text>
              <TextInput
                style={styles.input}
                value={widthMm}
                onChangeText={setWidthMm}
                keyboardType="numeric"
                placeholder="50"
                placeholderTextColor={C.textMuted}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Height (mm)</Text>
              <TextInput
                style={styles.input}
                value={heightMm}
                onChangeText={setHeightMm}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor={C.textMuted}
              />
            </View>
          </View>

          <Text style={styles.label}>Barcode Symbology</Text>
          <View style={styles.chipsRow}>
            {(['CODE128', 'CODE39', 'EAN13', 'UPCA'] as BarcodeSymbology[]).map((sym) => (
              <TouchableOpacity
                key={sym}
                style={[styles.chip, barcodeSymbology === sym && styles.chipActive]}
                onPress={() => setBarcodeSymbology(sym)}
              >
                <Text style={barcodeSymbology === sym ? styles.chipTextActive : styles.chipText}>
                  {sym}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {(rangeError || error) && (
            <Text style={styles.error}>{error ?? rangeError}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, !!rangeError && styles.btnDisabled]}
            onPress={handlePreview}
            disabled={!!rangeError}
          >
            <Text style={styles.buttonText}>Preview Sequence</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (!!rangeError || opening) && styles.btnDisabled]}
            onPress={handleOpenInCanvas}
            disabled={!!rangeError || opening}
          >
            <AppIcon name="square.and.pencil" tintColor={C.onAccent} size={18} />
            <Text style={[styles.buttonText, { marginLeft: 8 }]}>
              {opening ? 'Opening canvas…' : 'Open series on canvas'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Results & Action */}
        {generated.length > 0 && (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.previewCount}>
                {generated.length} labels ready for canvas
              </Text>
              <Text style={styles.previewRange}>
                {generated[0].text} → {generated[generated.length - 1].text}
              </Text>
            </View>

            <FlatList
              horizontal
              data={previewSlice}
              keyExtractor={(item) => String(item.index)}
              renderItem={({ item }) => (
                <LabelPreview item={item} widthMm={widthMm} heightMm={heightMm} />
              )}
              style={styles.previewList}
              showsHorizontalScrollIndicator={false}
            />

            <TouchableOpacity
              style={[styles.button, opening && styles.btnDisabled]}
              onPress={handleOpenInCanvas}
              disabled={opening}
            >
              <AppIcon name="square.and.pencil" tintColor={C.onAccent} size={18} />
              <Text style={[styles.buttonText, { marginLeft: 8 }]}>
                Open {generated.length} labels on canvas
              </Text>
            </TouchableOpacity>
            <Text style={styles.printHint}>Print from the editor to send the full series.</Text>
          </View>
        )}
      </FormScrollView>
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
  cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginTop: 12, marginBottom: 6 },
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
  row: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
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
    marginTop: 16,
  },
  secondaryButton: { backgroundColor: c.inkFill },
  btnDisabled: { opacity: 0.5 },
  buttonText: { color: c.onAccent, fontWeight: '700', fontSize: 15 },
  resultsContainer: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: c.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 20,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewCount: { fontSize: 15, fontWeight: '700', color: c.text },
  previewRange: { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
  previewList: { marginBottom: 8 },
  printHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
    color: c.textSecondary,
    textAlign: 'center',
  },
  previewCard: {
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (previewCard)
    borderWidth: 1,
    borderColor: '#E2E8F0', // theme-fixed: light preview (previewCard)
    borderRadius: 10,
    padding: 12,
    marginRight: 10,
    minWidth: 130,
    alignItems: 'center',
    shadowColor: '#000', // theme-fixed: light preview (previewCard)
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  previewIndex: { fontSize: 10, color: '#64748B', fontWeight: '700' }, // theme-fixed: light preview (previewIndex)
  previewDim: { fontSize: 10, color: '#94A3B8' }, // theme-fixed: light preview (previewDim)
  previewText: { fontWeight: '700', fontSize: 16, color: '#0F172A', marginBottom: 8 }, // theme-fixed: light preview (previewText)
  barcodeBox: { alignItems: 'center', width: '100%', backgroundColor: c.fill, padding: 6, borderRadius: 6 },
  barcodeBars: { fontSize: 12, letterSpacing: 2, color: c.text, fontWeight: '900' },
  barcodeText: { fontSize: 10, color: c.textSecondary, marginTop: 2, fontWeight: '600' },
}));
