import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';

import { useSerialEditor } from '@/components/editor/serial-context';
import { TextInput } from '@/components/ui/text-input';
import { validateConfig } from '@/lib/serial/engine';
import { storedValuePatch, type ContentKey } from '@/lib/serial/stored';
import { barcodeSerialIssues, qrSerialIssues } from '@/lib/serial/symbology-validate';
import { defaultSerialConfig, legacyToSerial } from '@/lib/serial/legacy';
import {
  type SerialConfig,
  type SerialContext,
} from '@/lib/serial/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export type ContentChoice = 'Manual' | 'Counter' | 'Data Source';
export const CONTENT_CHOICES = ['Manual', 'Counter', 'Data Source'] as const;

/** The stored contentType is still 'Degrees'; the UI calls it Counter. */
export function contentChoiceOf(contentType: string): ContentChoice {
  return contentType === 'Degrees' ? 'Counter' : (contentType as ContentChoice);
}

type SerialCarrier = { contentType: string; serial?: SerialConfig };

export { storedValuePatch } from '@/lib/serial/stored';

/**
 * What to patch when the user picks a Content Type. Returns null when nothing should change
 * (already that choice, or serial is blocked). Picking Counter on an old Counter changes nothing:
 * old Counters keep their old settings until the user upgrades them.
 */
export function contentChoicePatch(
  choice: ContentChoice,
  state: SerialCarrier,
  seedText: string,
  blockedReason: string | null,
  contentKey: ContentKey,
  encodeMode?: string,
): Record<string, unknown> | null {
  if (choice === 'Counter') {
    if (state.contentType === 'Degrees') return null;
    if (blockedReason) {
      Alert.alert('Counter', blockedReason);
      return null;
    }
    const serial = state.serial ?? defaultSerialConfig(seedText);
    return { contentType: 'Degrees', ...storedValuePatch(serial, contentKey, { encodeMode }) };
  }
  if (contentChoiceOf(state.contentType) === choice) return null;
  return { contentType: choice };
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  useThemeRefresh();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

function Chips<T extends string>({
  options,
  selected,
  onSelect,
  render,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  render?: (value: T) => string;
}) {
  useThemeRefresh();
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onSelect(o)} style={[styles.chip, o === selected && styles.chipActive]}>
          <Text style={[styles.chipText, o === selected && styles.chipTextActive]} numberOfLines={1}>
            {render ? render(o) : o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Input(props: { value: string; onChangeText: (t: string) => void; placeholder?: string; numeric?: boolean }) {
  useThemeRefresh();
  return (
    <TextInput
      style={styles.input}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={C.textMuted}
      keyboardType={props.numeric ? 'numbers-and-punctuation' : 'default'}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

/** What kind of code the field feeds, so barcode / QR checks can run in the editor. */
export type SerialTarget =
  | { type: 'barcode'; mode: string; widthMm: number }
  | { type: 'qrcode'; mode: string; level: string; zoneSize?: string; widthMm: number };

/** The one box a counter is typed in: "001", "SN-007" or "A-12-X" (prefix, number, suffix). */
function contentOf(config: SerialConfig): string {
  return `${config.prefix ?? ''}${config.start}${config.suffix ?? ''}`;
}

/** Splits what was typed into prefix, number and suffix. Null while there is no number yet. */
function configFromContent(config: SerialConfig, text: string): SerialConfig | null {
  const m = /^(.*?)(\d+)(\D*)$/s.exec(text);
  if (!m) return null;
  const { prefix: _prefix, suffix: _suffix, ...rest } = config;
  return { ...rest, kind: 'number', start: m[2], ...(m[1] ? { prefix: m[1] } : {}), ...(m[3] ? { suffix: m[3] } : {}) };
}

function StepRow({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  useThemeRefresh();
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepControls}>
        <Pressable onPress={onMinus} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`${label} minus`}>
          <Text style={styles.stepBtnText}>-</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable onPress={onPlus} hitSlop={6} style={styles.stepBtn} accessibilityLabel={`${label} plus`}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Counter settings for one element, as two rows: Degrees Offset (the gap between labels) and Content
 * (the first label, with any text before or after it). Every change patches the whole `serial`
 * object in ONE call (one undo step).
 */
export function SerialSection({
  config,
  patch,
  target,
}: {
  config: SerialConfig;
  patch: (updates: { serial: SerialConfig }) => void;
  target?: SerialTarget;
}) {
  // `patch` here already writes the stored text too (see SerialBlock).
  useThemeRefresh();
  const editor = useSerialEditor();
  const set = (changes: Partial<SerialConfig>) => patch({ serial: { ...config, ...changes } });
  const linked = Boolean(config.linkTo);
  const [draft, setDraft] = useState(contentOf(config));
  useEffect(() => setDraft(contentOf(config)), [config.prefix, config.start, config.suffix]);

  const context: SerialContext | undefined = target?.type === 'barcode' ? { encodeMode: target.mode } : undefined;
  const issues = useMemo(() => {
    const base = validateConfig(config, editor.count, editor.offset, context);
    if (!target || base.some((i) => i.severity === 'error')) return base;
    // Barcode / QR checks use the whole label's fields so a link resolves to its root.
    const configs = { ...editor.configs, [config.id]: config };
    const contexts = { ...editor.contexts, ...(context ? { [config.id]: context } : {}) };
    const extra =
      target.type === 'barcode'
        ? barcodeSerialIssues({ mode: target.mode, config, configs, contexts, count: editor.count, offset: editor.offset, widthMm: target.widthMm, dpi: editor.printerDpi ?? undefined })
        : qrSerialIssues({ mode: target.mode, level: target.level, zoneSize: target.zoneSize, config, configs, contexts, count: editor.count, offset: editor.offset, widthMm: target.widthMm, dpi: editor.printerDpi ?? undefined });
    return [...base, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, editor.count, editor.offset, editor.configs, editor.contexts, editor.printerDpi, target?.type, (target as { mode?: string } | undefined)?.mode, (target as { level?: string } | undefined)?.level, target?.widthMm]);
  const links = editor.linkOptions(config.id);

  if (editor.blockedReason) {
    return <Text style={styles.error}>{editor.blockedReason}</Text>;
  }

  const stepNow = Number(config.step);
  const stepValue = Number.isFinite(stepNow) ? stepNow : 1;
  const hasNumber = /\d/.test(draft);

  return (
    <View>
      {links.length > 0 || linked ? (
        <View style={styles.wrap}>
          <Field
            label="Same counter as"
            hint="Shows exactly the same value as another field, so a barcode and its text can never differ. Off keeps its own settings.">
            <Chips
              options={['Own', ...links.map((l) => l.id)] as readonly string[]}
              selected={config.linkTo ?? 'Own'}
              onSelect={(v) => set({ linkTo: v === 'Own' ? undefined : v })}
              render={(v) => (v === 'Own' ? 'Own settings' : links.find((l) => l.id === v)?.label ?? 'Field')}
            />
          </Field>
        </View>
      ) : null}

      {linked ? (
        <Text style={[styles.hint, styles.wrap]}>This field follows the one you picked. Change its Content or Degrees Offset there.</Text>
      ) : (
        <>
          <StepRow
            label="Degrees Offset"
            value={String(stepValue)}
            onMinus={() => set({ step: String(Math.max(1, Math.round(stepValue) - 1)) })}
            onPlus={() => set({ step: String(Math.max(1, Math.round(stepValue) + 1)) })}
          />
          <View style={styles.contentRow}>
            <Text style={styles.stepLabel}>Content</Text>
            <Pressable onPress={() => router.push({ pathname: '/scan', params: { from: 'edit' } })} hitSlop={8} accessibilityLabel="Scan">
              <AppIcon name="viewfinder" tintColor={C.accent} size={22} />
            </Pressable>
          </View>
          <TextInput
            style={styles.contentInput}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              const next = configFromContent(config, text);
              if (next) patch({ serial: next });
            }}
            placeholder="001"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!hasNumber ? <Text style={[styles.hint, styles.wrap]}>Include a number to count, e.g. 001 or SN-001.</Text> : null}
        </>
      )}

      <View style={styles.wrap}>
        {issues.map((i, n) => (
          <View key={`${i.field}-${n}`}>
            <Text style={i.severity === 'error' ? styles.error : styles.warn}>{i.message}</Text>
            {i.fix ? (
              <Pressable onPress={() => patch({ serial: i.fix!.serial })} style={styles.moreBtn}>
                <Text style={styles.moreText}>Fix: {i.fix.label}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Notice + button on an old Counter. Upgrading changes what label 1 shows (see the report). */
export function LegacyCounterNotice({
  content,
  degreesOffset,
  onUpgrade,
}: {
  content: string;
  degreesOffset: number;
  onUpgrade: (serial: SerialConfig) => void;
}) {
  useThemeRefresh();
  const upgrade = () => {
    const converted = legacyToSerial(content, degreesOffset, defaultSerialConfig().id);
    if (!converted) {
      Alert.alert('Counter', 'This counter has no number in it, so it cannot be converted. Type a value such as 015 first.');
      return;
    }
    Alert.alert(
      'Use the new Counter settings?',
      'The first label will show the value you typed. An old counter shows that value plus one step on its first label, so printed numbers will change.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: () => onUpgrade(converted) },
      ],
    );
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>This is an older counter. It keeps working exactly as before.</Text>
      <Pressable onPress={upgrade} style={styles.moreBtn}>
        <Text style={styles.moreText}>Switch to new Counter settings</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  intro: { fontSize: 12, lineHeight: 17, color: c.textMuted, marginBottom: 8 },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 6 },
  hint: { fontSize: 12, lineHeight: 16, color: c.textSecondary, marginTop: 6 },
  input: {
    backgroundColor: c.fill,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: c.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 34, borderRadius: 8, backgroundColor: c.fillStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  chipActive: { backgroundColor: c.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  chipTextActive: { color: c.onAccent },
  error: { color: c.danger, fontSize: 13, fontWeight: '500', marginBottom: 6 },
  warn: { color: c.textSecondary, fontSize: 13, marginBottom: 6 },
  previewLine: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  stepLabel: { fontSize: 15, color: c.text, flexShrink: 1 },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, lineHeight: 22, color: c.accent, fontWeight: '600' },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: 14, color: c.accent, flexShrink: 1 },
  contentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  contentInput: { marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, fontSize: 16, color: c.text },
  moreBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  moreText: { fontSize: 13, fontWeight: '700', color: c.link },
}));

/** Content Type row for a panel: Manual | Serial | Data Source. `Row` is the panel's own SegmentRow. */
export function ContentTypeRow({
  Row,
  state,
  patch,
  seedText,
  contentKey,
  encodeMode,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Row: React.ComponentType<any>;
  state: SerialCarrier;
  patch: (updates: any) => void;
  seedText: string;
  contentKey: ContentKey;
  encodeMode?: string;
}) {
  const { blockedReason } = useSerialEditor();
  return (
    <Row
      label="Content Type"
      options={CONTENT_CHOICES}
      selected={contentChoiceOf(state.contentType)}
      onSelect={(choice: ContentChoice) => {
        const next = contentChoicePatch(choice, state, seedText, blockedReason, contentKey, encodeMode);
        if (next) patch(next);
      }}
    />
  );
}

/**
 * Below the Content Type row. New Serial settings when the element has a `serial` config; otherwise the
 * panel's own legacy Counter stepper stays, with an optional upgrade.
 */
export function SerialBlock({
  state,
  patch,
  legacyStepper,
  legacyContent,
  legacyOffset,
  target,
  contentKey,
}: {
  state: SerialCarrier;
  patch: (updates: any) => void;
  legacyStepper: React.ReactNode;
  legacyContent: string;
  legacyOffset: number;
  target?: SerialTarget;
  contentKey: ContentKey;
}) {
  if (state.contentType !== 'Degrees') return null;
  if (state.serial) {
    const ctx = target?.type === 'barcode' ? { encodeMode: target.mode } : undefined;
    return (
      <SerialSection
        config={state.serial}
        patch={(u) => patch(storedValuePatch(u.serial, contentKey, ctx))}
        target={target}
      />
    );
  }
  return (
    <>
      {legacyStepper}
      <LegacyCounterNotice content={legacyContent} degreesOffset={legacyOffset} onUpgrade={(serial) => patch(storedValuePatch(serial, contentKey, target?.type === 'barcode' ? { encodeMode: target.mode } : undefined))} />
    </>
  );
}
