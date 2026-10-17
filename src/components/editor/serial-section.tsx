import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useSerialEditor } from '@/components/editor/serial-context';
import { TextInput } from '@/components/ui/text-input';
import { firstAndLast, validateConfig } from '@/lib/serial/engine';
import { defaultSerialConfig, legacyToSerial } from '@/lib/serial/legacy';
import {
  MAX_SERIAL_BATCH,
  type SerialConfig,
  type SerialContext,
  type SerialIssue,
  type SerialKind,
} from '@/lib/serial/types';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export type ContentChoice = 'Manual' | 'Serial' | 'Data Source';
export const CONTENT_CHOICES = ['Manual', 'Serial', 'Data Source'] as const;

/** The stored contentType is still 'Degrees'; the UI calls it Serial. */
export function contentChoiceOf(contentType: string): ContentChoice {
  return contentType === 'Degrees' ? 'Serial' : (contentType as ContentChoice);
}

type SerialCarrier = { contentType: string; serial?: SerialConfig };

/**
 * What to patch when the user picks a Content Type. Returns null when nothing should change
 * (already that choice, or serial is blocked). Picking Serial on an old Counter changes nothing:
 * old Counters keep their old settings until the user upgrades them.
 */
export function contentChoicePatch(
  choice: ContentChoice,
  state: SerialCarrier,
  seedText: string,
  blockedReason: string | null,
): { contentType: 'Manual' | 'Degrees' | 'Data Source'; serial?: SerialConfig } | null {
  if (choice === 'Serial') {
    if (state.contentType === 'Degrees') return null;
    if (blockedReason) {
      Alert.alert('Serial labels', blockedReason);
      return null;
    }
    return { contentType: 'Degrees', serial: state.serial ?? defaultSerialConfig(seedText) };
  }
  if (contentChoiceOf(state.contentType) === choice) return null;
  return { contentType: choice };
}

const KIND_LABEL: Record<SerialKind, string> = {
  number: 'Number',
  decimal: 'Decimal',
  letters: 'Letters',
  alnum: 'Letters + Numbers',
  hex: 'Hex',
  custom: 'Custom',
};
const KIND_HINT: Record<SerialKind, string> = {
  number: 'Whole numbers: 1, 2, 3 ...',
  decimal: 'Numbers with decimals: 0.5, 1.0, 1.5 ...',
  letters: 'A, B ... Z, then AA, AB ... like spreadsheet columns.',
  alnum: 'Digits and letters together, fixed length: 00A, 00B ... 00Z, 010.',
  hex: 'Hexadecimal: 0-9 and A-F.',
  custom: 'Count with your own characters.',
};
const KINDS = Object.keys(KIND_LABEL) as SerialKind[];

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

/** Count keeps its own draft so clearing the field while typing does not snap it back to 1. */
function CountInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Input
      value={draft}
      onChangeText={(t) => {
        const digits = t.replace(/\D/g, '');
        setDraft(digits);
        const n = parseInt(digits, 10);
        if (Number.isFinite(n) && n >= 1) onCommit(Math.min(MAX_SERIAL_BATCH, n));
      }}
      placeholder="10"
      numeric
    />
  );
}

/**
 * Serial settings for one element. Simple view: Type, Start, Step, Count. Everything else is under
 * More options. Every change patches the whole `serial` object in ONE call (one undo step).
 */
export function SerialSection({
  config,
  patch,
  context,
  elementIssues = [],
}: {
  config: SerialConfig;
  patch: (updates: { serial: SerialConfig }) => void;
  context?: SerialContext;
  /** Extra problems for this element (barcode / QR checks). */
  elementIssues?: SerialIssue[];
}) {
  useThemeRefresh();
  const editor = useSerialEditor();
  const [more, setMore] = useState(false);
  const set = (changes: Partial<SerialConfig>) => patch({ serial: { ...config, ...changes } });
  const linked = Boolean(config.linkTo);
  const kind = config.kind;
  const numeric = kind === 'number' || kind === 'decimal';

  const issues = useMemo(
    () => [...validateConfig(config, editor.count, 0, context), ...elementIssues],
    [config, editor.count, context, elementIssues],
  );
  const preview = useMemo(
    () => (issues.some((i) => i.severity === 'error') ? null : firstAndLast(config, editor.count, 0, context)),
    [config, editor.count, context, issues],
  );
  const links = editor.linkOptions(config.id);

  if (editor.blockedReason) {
    return <Text style={styles.error}>{editor.blockedReason}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        Each label gets the next value. Use the bar under the canvas to look at any label in the series.
      </Text>

      {links.length > 0 || linked ? (
        <Field
          label="Same serial as"
          hint="Shows exactly the same value as another field, so a barcode and its text can never differ. Off keeps its own settings.">
          <Chips
            options={['Own', ...links.map((l) => l.id)] as readonly string[]}
            selected={config.linkTo ?? 'Own'}
            onSelect={(v) => set({ linkTo: v === 'Own' ? undefined : v })}
            render={(v) => (v === 'Own' ? 'Own settings' : links.find((l) => l.id === v)?.label ?? 'Field')}
          />
        </Field>
      ) : null}

      {linked ? (
        <Text style={styles.hint}>This field follows the one you picked. Change its Type, Start or Step there.</Text>
      ) : (
        <>
          <Field label="Type" hint={KIND_HINT[kind]}>
            <Chips options={KINDS} selected={kind} onSelect={(k) => changeKind(config, k, patch)} render={(k) => KIND_LABEL[k]} />
          </Field>

          <Field
            label="Start"
            hint={
              kind === 'letters'
                ? 'The first value, e.g. A or AA.'
                : numeric
                  ? 'The first value. Leading zeros such as 007 keep the same width.'
                  : 'The first value, written with the characters of this type.'
            }>
            <Input value={config.start} onChangeText={(start) => set({ start })} placeholder={kind === 'letters' ? 'A' : '1'} numeric={numeric} />
          </Field>

          <Field
            label="Step"
            hint={
              kind === 'letters' || !numeric
                ? 'How many positions to move each label. 1 = next, -1 = backwards.'
                : 'How much to add each label. Use a minus sign to count down.'
            }>
            <Input value={config.step} onChangeText={(step) => set({ step })} placeholder="1" numeric />
          </Field>
        </>
      )}

      {!editor.isBulk ? (
        <Field
          label="Count"
          hint={`How many labels to print (1 to ${MAX_SERIAL_BATCH}). Shared by every serial field on this label.`}>
          <CountInput value={editor.count} onCommit={editor.setCount} />
        </Field>
      ) : (
        <Text style={styles.hint}>This label prints one per Excel row, so the row number sets the value.</Text>
      )}

      {issues.map((i, n) => (
        <Text key={`${i.field}-${n}`} style={i.severity === 'error' ? styles.error : styles.warn}>
          {i.message}
        </Text>
      ))}
      {preview ? (
        <Text style={styles.previewLine}>
          {preview.first}
          {editor.count > 1 ? `  ...  ${preview.last}` : ''}
        </Text>
      ) : null}

      {!linked ? (
        <>
          <Pressable onPress={() => setMore((m) => !m)} style={styles.moreBtn}>
            <Text style={styles.moreText}>{more ? 'Hide more options' : 'More options'}</Text>
          </Pressable>
          {more ? <MoreOptions config={config} set={set} numeric={numeric} /> : null}
        </>
      ) : null}
    </View>
  );
}

function changeKind(config: SerialConfig, kind: SerialKind, patch: (u: { serial: SerialConfig }) => void) {
  if (kind === config.kind) return;
  const start = kind === 'letters' ? 'A' : kind === 'alnum' || kind === 'hex' ? '0' : kind === 'custom' ? '' : '1';
  patch({
    serial: {
      ...config,
      kind,
      start: (kind === 'number' || kind === 'decimal') && (config.kind === 'number' || config.kind === 'decimal') ? config.start : start,
      step: '1',
      minWidth: undefined,
      padChar: undefined,
      alphabet: kind === 'custom' ? config.alphabet ?? '01' : undefined,
      decimals: kind === 'decimal' ? config.decimals ?? 2 : undefined,
    },
  });
}

function MoreOptions({ config, set, numeric }: { config: SerialConfig; set: (c: Partial<SerialConfig>) => void; numeric: boolean }) {
  useThemeRefresh();
  const kind = config.kind;
  const intFrom = (t: string): number | undefined => {
    const n = parseInt(t.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return (
    <View>
      <Field label="Prefix" hint="Fixed text before the value, e.g. SN-.">
        <Input value={config.prefix ?? ''} onChangeText={(t) => set({ prefix: t || undefined })} />
      </Field>
      <Field label="Suffix" hint="Fixed text after the value, e.g. -A.">
        <Input value={config.suffix ?? ''} onChangeText={(t) => set({ suffix: t || undefined })} />
      </Field>

      {kind !== 'letters' ? (
        <Field label="Minimum width" hint="Pads short values to this many characters. 3 turns 7 into 007. 0 = off.">
          <Input value={String(config.minWidth ?? 0)} onChangeText={(t) => set({ minWidth: intFrom(t) || undefined })} numeric />
        </Field>
      ) : null}
      {numeric ? (
        <Field label="Pad character" hint="The character used for padding. Default 0.">
          <Input value={config.padChar ?? ''} onChangeText={(t) => set({ padChar: Array.from(t).slice(-1).join('') || undefined })} placeholder="0" />
        </Field>
      ) : null}

      {kind === 'decimal' ? (
        <>
          <Field label="Decimal places" hint="How many digits after the point (0 to 8). Values are exact, never rounded as you count.">
            <Input value={String(config.decimals ?? 2)} onChangeText={(t) => set({ decimals: Math.min(8, intFrom(t) ?? 0) })} numeric />
          </Field>
          <Field label="Rounding" hint="Only used if Start or Step has more decimals than allowed. Half-up rounds 0.5 up; Down cuts the extra digits.">
            <Chips options={['half-up', 'down'] as const} selected={config.rounding ?? 'half-up'} onSelect={(rounding) => set({ rounding })} render={(v) => (v === 'down' ? 'Down' : 'Half-up')} />
          </Field>
        </>
      ) : null}

      {kind === 'letters' || kind === 'alnum' || kind === 'hex' ? (
        <Field label="Letter case" hint="Upper or lower case letters.">
          <Chips options={['upper', 'lower'] as const} selected={config.letterCase ?? 'upper'} onSelect={(letterCase) => set({ letterCase })} render={(v) => (v === 'upper' ? 'UPPER' : 'lower')} />
        </Field>
      ) : null}

      {kind === 'custom' ? (
        <Field label="Characters" hint="The characters to count with, in order, each once. 01 counts in binary. Needs at least 2.">
          <Input value={config.alphabet ?? ''} onChangeText={(alphabet) => set({ alphabet })} placeholder="01" />
        </Field>
      ) : null}

      {!numeric ? (
        <Field label="Skip characters" hint="Characters never used, so serials stay readable. Skipping I and O leaves 24 letters (base 24).">
          <Input value={config.excluded ?? ''} onChangeText={(t) => set({ excluded: t || undefined })} placeholder="IOQ" />
        </Field>
      ) : null}

      <Field label="Repeat each value" hint="Same value on this many labels in a row. 2 gives 1, 1, 2, 2, 3, 3. This is not the same as print copies.">
        <Input value={String(config.repeatEach ?? 1)} onChangeText={(t) => set({ repeatEach: Math.max(1, intFrom(t) ?? 1) })} numeric />
      </Field>

      <Field label="When it runs past its width" hint="Extend adds a digit (999 to 1000, Z to AA). Wrap starts again (999 to 000, Z to A). Stop blocks printing with a message.">
        <Chips options={['extend', 'wrap', 'stop'] as const} selected={config.overflow ?? 'extend'} onSelect={(overflow) => set({ overflow })} render={(v) => v[0].toUpperCase() + v.slice(1)} />
      </Field>

      <Field label="Check digit" hint="Adds a final digit that scanners use to catch misreads. Barcode uses it for EAN and UPC; Mod 10 works with digits only.">
        <Chips options={['none', 'mod10', 'symbology'] as const} selected={config.checkDigit ?? 'none'} onSelect={(checkDigit) => set({ checkDigit })} render={(v) => (v === 'none' ? 'None' : v === 'mod10' ? 'Mod 10' : 'Barcode type')} />
      </Field>
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
      Alert.alert('Serial', 'This counter has no number in it, so it cannot be converted. Type a value such as 015 first.');
      return;
    }
    Alert.alert(
      'Use the new Serial settings?',
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
        <Text style={styles.moreText}>Switch to new Serial settings</Text>
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
  moreBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  moreText: { fontSize: 13, fontWeight: '700', color: c.link },
}));

/** Content Type row for a panel: Manual | Serial | Data Source. `Row` is the panel's own SegmentRow. */
export function ContentTypeRow({
  Row,
  state,
  patch,
  seedText,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Row: React.ComponentType<any>;
  state: SerialCarrier;
  patch: (updates: any) => void;
  seedText: string;
}) {
  const { blockedReason } = useSerialEditor();
  return (
    <Row
      label="Content Type"
      options={CONTENT_CHOICES}
      selected={contentChoiceOf(state.contentType)}
      onSelect={(choice: ContentChoice) => {
        const next = contentChoicePatch(choice, state, seedText, blockedReason);
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
  context,
  elementIssues,
}: {
  state: SerialCarrier;
  patch: (updates: any) => void;
  legacyStepper: React.ReactNode;
  legacyContent: string;
  legacyOffset: number;
  context?: SerialContext;
  elementIssues?: SerialIssue[];
}) {
  if (state.contentType !== 'Degrees') return null;
  if (state.serial) {
    return <SerialSection config={state.serial} patch={patch} context={context} elementIssues={elementIssues} />;
  }
  return (
    <>
      {legacyStepper}
      <LegacyCounterNotice content={legacyContent} degreesOffset={legacyOffset} onUpgrade={(serial) => patch({ serial })} />
    </>
  );
}
