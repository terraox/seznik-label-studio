import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Palette } from '@/constants/ui';
import { parseCustomPageList, parsePageRange, type PdfPrintSelection } from '@/lib/pdf-editor/session';

type Mode = PdfPrintSelection['mode'];

const MODES: { id: Mode; label: string; detail: string }[] = [
  { id: 'current', label: 'Current page', detail: 'Only the page you were just viewing' },
  { id: 'range', label: 'Range', detail: 'A continuous run, such as 1 to 4' },
  { id: 'custom', label: 'Custom', detail: 'Specific pages, such as 1, 3, 5' },
  { id: 'even', label: 'Even', detail: 'Pages 2, 4, 6…' },
  { id: 'odd', label: 'Odd', detail: 'Pages 1, 3, 5…' },
];

export type PdfPrintPanelHandle = {
  submit: () => void;
};

export const PdfPrintPanel = forwardRef<
  PdfPrintPanelHandle,
  {
    pageCount: number;
    currentPage: number;
    printing: boolean;
    progress: string | null;
    onPrint: (selection: PdfPrintSelection, copies: number) => void;
  }
>(function PdfPrintPanel({ pageCount, currentPage, printing, progress, onPrint }, ref) {
  const [mode, setMode] = useState<Mode>('current');
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState(String(Math.max(1, pageCount)));
  const [custom, setCustom] = useState('');
  const [copies, setCopies] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(() => {
    if (printing) return;
    if (mode === 'current') {
      setError(null);
      onPrint({ mode: 'current' }, copies);
      return;
    }
    if (mode === 'even' || mode === 'odd') {
      setError(null);
      onPrint({ mode }, copies);
      return;
    }
    if (mode === 'range') {
      const parsed = parsePageRange(rangeStart, rangeEnd, pageCount);
      if (!parsed.start || !parsed.end) {
        setError('Enter a valid page range.');
        return;
      }
      setError(parsed.error ?? null);
      onPrint({ mode: 'range', start: parsed.start, end: parsed.end }, copies);
      return;
    }
    const parsed = parseCustomPageList(custom, pageCount);
    if (parsed.error || parsed.pages.length === 0) {
      setError(parsed.error ?? 'Enter at least one page number.');
      return;
    }
    setError(null);
    onPrint({ mode: 'custom', pages: parsed.pages }, copies);
  }, [copies, custom, mode, onPrint, pageCount, printing, rangeEnd, rangeStart]);

  useImperativeHandle(ref, () => ({ submit }), [submit]);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>What to print</Text>
        <Text style={styles.sub}>
          Page {currentPage} of {pageCount}. The preview above is the label that will print.
        </Text>
        {MODES.map((item) => {
          const selected = mode === item.id;
          return (
            <Pressable
              key={item.id}
              disabled={printing}
              onPress={() => {
                setMode(item.id);
                setError(null);
              }}
              style={[styles.option, selected && styles.optionOn]}>
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{item.label}</Text>
                <Text style={styles.optionDetail}>{item.detail}</Text>
              </View>
            </Pressable>
          );
        })}
        {mode === 'range' ? (
          <View style={styles.rangeRow}>
            <TextInput
              keyboardType="number-pad"
              value={rangeStart}
              onChangeText={setRangeStart}
              style={styles.input}
              editable={!printing}
            />
            <Text style={styles.to}>to</Text>
            <TextInput
              keyboardType="number-pad"
              value={rangeEnd}
              onChangeText={setRangeEnd}
              style={styles.input}
              editable={!printing}
            />
            <Text style={styles.hint}>of {pageCount}</Text>
          </View>
        ) : null}
        {mode === 'custom' ? (
          <TextInput
            value={custom}
            onChangeText={setCustom}
            placeholder="1, 3, 5"
            placeholderTextColor={Palette.muted}
            style={styles.custom}
            editable={!printing}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Copies</Text>
        <View style={styles.stepper}>
          <Pressable
            disabled={printing || copies <= 1}
            onPress={() => setCopies((n) => Math.max(1, n - 1))}
            style={[styles.stepBtn, (printing || copies <= 1) && styles.off]}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.stepValue}>{copies}</Text>
          <Pressable
            disabled={printing || copies >= 99}
            onPress={() => setCopies((n) => Math.min(99, n + 1))}
            style={[styles.stepBtn, (printing || copies >= 99) && styles.off]}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.note}>Darkness, speed, and gap follow Label Settings.</Text>
      {progress ? <Text style={styles.progress}>{progress}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: '600', color: Palette.ink },
  sub: { fontSize: 13, color: Palette.muted, lineHeight: 18 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionOn: { borderColor: Palette.accent, backgroundColor: '#EEF2FF' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Palette.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.accent },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: Palette.ink },
  optionLabelOn: { color: Palette.accent },
  optionDetail: { fontSize: 12, color: '#64748B' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 64,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: 'center',
    color: Palette.ink,
    backgroundColor: '#FFFFFF',
  },
  custom: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Palette.ink,
    backgroundColor: '#FFFFFF',
  },
  to: { color: Palette.muted },
  hint: { color: Palette.muted, fontSize: 13 },
  err: { color: Palette.danger, fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  stepBtnText: { fontSize: 22, color: Palette.ink, fontWeight: '500' },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: '600', color: Palette.ink },
  note: { fontSize: 12, color: '#94A3B8', lineHeight: 16, paddingHorizontal: 4 },
  progress: { textAlign: 'center', color: Palette.muted },
  off: { opacity: 0.4 },
});
