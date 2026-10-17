/**
 * Serial engine. valueAt(config, index) returns the value for ANY label index directly:
 * no loop from the start, no accumulated state. The editor preview and the print path both
 * call it (through resolveField), so what is previewed is what prints.
 */

import {
  bijectiveFirstOrdinal,
  bijectiveLastOrdinal,
  fromBijective,
  fromPositional,
  resolveAlphabet,
  toBijective,
  toPositional,
} from './alphabet';
import { checkDigitPayloadLength, gs1CheckDigit, luhnCheckDigit } from './check-digit';
import { formatScaled, integerDigits, leadingZeroWidth, parseScaled, pow10 } from './decimal';
import {
  MAX_SERIAL_BATCH,
  type SerialConfig,
  type SerialContext,
  type SerialIssue,
  type SerialResult,
} from './types';

const fail = (reason: 'overflow' | 'underflow' | 'invalid-config', message: string): SerialResult => ({
  ok: false,
  reason,
  message,
});

const posMod = (a: bigint, m: bigint): bigint => ((a % m) + m) % m;

function parseStep(text: string): bigint | null {
  return /^[+-]?\d+$/.test(text.trim()) ? BigInt(text.trim()) : null;
}

export function decimalsOf(config: SerialConfig): number {
  if (config.kind === 'number') return 0;
  const d = Math.floor(config.decimals ?? 2);
  return Math.max(0, Math.min(8, Number.isFinite(d) ? d : 2));
}

export function repeatOf(config: SerialConfig): number {
  const r = Math.floor(config.repeatEach ?? 1);
  return Number.isFinite(r) && r >= 1 ? r : 1;
}

function numericCore(config: SerialConfig, valueIndex: bigint): SerialResult & { core?: string } {
  const d = decimalsOf(config);
  const rounding = config.rounding ?? 'half-up';
  const start = parseScaled(config.start, d, rounding);
  if (start === null) {
    return fail('invalid-config', config.kind === 'number' ? 'Start must be a whole number.' : 'Start must be a number.');
  }
  const step = parseScaled(config.step, d, rounding);
  if (step === null) return fail('invalid-config', 'Step must be a number.');
  if (step === 0n) return fail('invalid-config', 'Step cannot be 0.');

  const padChar = config.padChar && Array.from(config.padChar).length === 1 ? config.padChar : '0';
  const minWidth = Math.max(0, Math.floor(config.minWidth ?? 0));
  const width = Math.max(minWidth, leadingZeroWidth(config.start));
  const startMag = start < 0n ? -start : start;
  // Width the value is allowed to occupy before it counts as running past its width.
  const bound = width > 0 ? width : integerDigits(startMag, d);
  const limit = pow10(bound + d);
  const overflow = config.overflow ?? 'extend';

  let v = start + step * valueIndex;
  if (start >= 0n && v < 0n) {
    if (overflow !== 'wrap') return fail('underflow', 'The series goes below 0. Start higher or step up.');
    v = posMod(v, limit);
  }
  const mag = v < 0n ? -v : v;
  if (mag >= limit) {
    if (overflow === 'stop') return fail('overflow', `The value runs past ${bound} digits.`);
    if (overflow === 'wrap') {
      const wrapped = mag % limit;
      v = v < 0n ? -wrapped : wrapped;
    }
  }
  return { ok: true, value: '', core: formatScaled(v, d, width, padChar) };
}

function alphabetCore(config: SerialConfig, valueIndex: bigint): SerialResult & { core?: string } {
  const alpha = resolveAlphabet(config);
  if (!alpha.ok) return fail('invalid-config', alpha.message);
  const base = alpha.chars.length;
  const step = parseStep(config.step);
  if (step === null) return fail('invalid-config', 'Step must be a whole number.');
  if (step === 0n) return fail('invalid-config', 'Step cannot be 0.');
  const overflow = config.overflow ?? 'extend';
  const start = config.start.trim();

  if (config.kind === 'letters') {
    const ord0 = fromBijective(start, alpha.lookup, base);
    if (ord0 === null) return fail('invalid-config', 'Start can only use the letters that are not excluded.');
    const len = Array.from(start).length;
    const first = bijectiveFirstOrdinal(len, base);
    const last = bijectiveLastOrdinal(len, base);
    const size = last - first + 1n;
    let n = ord0 + step * valueIndex;
    if (n < first || n > last) {
      if (overflow === 'wrap') n = first + posMod(n - first, size);
      else if (overflow === 'stop') {
        return n > last
          ? fail('overflow', `The letters run past ${len} character${len === 1 ? '' : 's'}.`)
          : fail('underflow', `The letters drop below ${len} character${len === 1 ? '' : 's'}.`);
      } else if (n < 1n) return fail('underflow', 'The letters run before the first value.');
    }
    return { ok: true, value: '', core: toBijective(n, alpha.chars) };
  }

  const ord0 = fromPositional(start, alpha.lookup, base);
  if (ord0 === null) return fail('invalid-config', 'Start uses a character that is not in the alphabet.');
  const width = Math.max(Math.floor(config.minWidth ?? 0), Array.from(start).length);
  const max = BigInt(base) ** BigInt(width);
  let n = ord0 + step * valueIndex;
  if (n < 0n) {
    if (overflow !== 'wrap') return fail('underflow', 'The series goes below its first value.');
    n = posMod(n, max);
  } else if (n >= max) {
    if (overflow === 'stop') return fail('overflow', `The value runs past ${width} characters.`);
    if (overflow === 'wrap') n %= max;
  }
  return { ok: true, value: '', core: toPositional(n, alpha.chars, width) };
}

/** The value for a label index (0-based), with prefix, suffix and check digit. */
export function valueAt(config: SerialConfig, index: number, ctx?: SerialContext): SerialResult {
  if (!Number.isInteger(index) || index < 0) return fail('invalid-config', 'Label number is not valid.');
  const valueIndex = BigInt(Math.floor(index / repeatOf(config)));
  const part =
    config.kind === 'number' || config.kind === 'decimal'
      ? numericCore(config, valueIndex)
      : alphabetCore(config, valueIndex);
  if (!part.ok || part.core === undefined) return part.ok ? fail('invalid-config', 'No value.') : part;

  let text = `${config.prefix ?? ''}${part.core}${config.suffix ?? ''}`;
  const check = config.checkDigit ?? 'none';
  if (check === 'mod10') {
    if (!/^\d+$/.test(text)) return fail('invalid-config', 'A check digit needs the whole value to be digits.');
    text += String(luhnCheckDigit(text));
  } else if (check === 'symbology') {
    const need = checkDigitPayloadLength(ctx?.encodeMode);
    if (need !== null && /^\d+$/.test(text) && text.length === need) text += String(gs1CheckDigit(text));
  }
  return { ok: true, value: text };
}

/**
 * Value for field `id`, following "same serial as" links to the root field.
 * A linked element shows exactly what its root produces, including an appended check digit.
 */
export function resolveField(
  configs: Record<string, SerialConfig>,
  id: string,
  index: number,
  contexts: Record<string, SerialContext> = {},
): SerialResult {
  let current = configs[id];
  const seen = new Set<string>();
  while (current?.linkTo) {
    if (seen.has(current.id)) return fail('invalid-config', 'The serial links form a loop.');
    seen.add(current.id);
    const next = configs[current.linkTo];
    if (!next) return fail('invalid-config', 'The linked serial no longer exists.');
    current = next;
    if (seen.size > 8) return fail('invalid-config', 'The serial links are too deep.');
  }
  if (!current) return fail('invalid-config', 'Serial field not found.');
  return valueAt(current, index, contexts[current.id]);
}

/** Root field of a link chain, or null for a loop / missing target. */
export function rootOf(configs: Record<string, SerialConfig>, id: string): SerialConfig | null {
  let current = configs[id];
  const seen = new Set<string>();
  while (current?.linkTo) {
    if (seen.has(current.id) || seen.size > 8) return null;
    seen.add(current.id);
    current = configs[current.linkTo];
  }
  return current ?? null;
}

export function firstAndLast(
  config: SerialConfig,
  count: number,
  offset = 0,
  ctx?: SerialContext,
): { first: string; last: string } | null {
  const a = valueAt(config, offset, ctx);
  const b = valueAt(config, offset + Math.max(0, count - 1), ctx);
  return a.ok && b.ok ? { first: a.value, last: b.value } : null;
}

/** The widest value in labels [offset, offset + count). Scans without keeping the batch (count <= 5000). */
export function longestValue(config: SerialConfig, count: number, offset = 0, ctx?: SerialContext): string | null {
  let best: string | null = null;
  const n = Math.min(Math.max(0, Math.floor(count)), MAX_SERIAL_BATCH);
  for (let i = 0; i < n; i += 1) {
    const r = valueAt(config, offset + i, ctx);
    if (!r.ok) return best;
    if (best === null || Array.from(r.value).length > Array.from(best).length) best = r.value;
  }
  return best;
}

/** Plain-language problems with a config for a batch. Empty array when it is valid. */
export function validateConfig(config: SerialConfig, count: number, offset = 0, ctx?: SerialContext): SerialIssue[] {
  const issues: SerialIssue[] = [];
  const err = (field: SerialIssue['field'], message: string, label?: number) =>
    issues.push({ field, message, severity: 'error', ...(label ? { label } : {}) });

  if (!Number.isInteger(count) || count < 1) err('count', 'Count must be at least 1.');
  else if (count > MAX_SERIAL_BATCH) err('count', `Count is limited to ${MAX_SERIAL_BATCH} labels.`);

  if (config.linkTo) return issues;

  if (!config.start.trim()) err('start', 'Enter a start value.');
  if (!config.step.trim()) err('step', 'Enter a step.');
  if ((config.prefix ?? '').length > 64) err('prefix', 'Prefix is too long (64 characters at most).');
  if ((config.suffix ?? '').length > 64) err('suffix', 'Suffix is too long (64 characters at most).');
  if (config.minWidth !== undefined && (!Number.isInteger(config.minWidth) || config.minWidth < 0 || config.minWidth > 40)) {
    err('minWidth', 'Minimum width must be a whole number from 0 to 40.');
  }
  if (config.padChar !== undefined && config.padChar !== '' && Array.from(config.padChar).length !== 1) {
    err('padChar', 'Pad character must be a single character.');
  }
  if (config.kind === 'decimal') {
    const d = config.decimals;
    if (d !== undefined && (!Number.isInteger(d) || d < 0 || d > 8)) err('decimals', 'Decimal places must be from 0 to 8.');
  }
  if (config.repeatEach !== undefined && (!Number.isInteger(config.repeatEach) || config.repeatEach < 1)) {
    err('repeatEach', 'Repeat must be a whole number, 1 or more.');
  }
  if (config.kind !== 'number' && config.kind !== 'decimal') {
    const alpha = resolveAlphabet(config);
    if (!alpha.ok) err(config.kind === 'custom' && !(config.alphabet ?? '').length ? 'alphabet' : config.excluded ? 'excluded' : 'alphabet', alpha.message);
  }
  if (issues.some((i) => i.severity === 'error')) return issues;

  // Find the first label that cannot be produced (stop, underflow, bad start, check digit).
  const n = Math.min(Math.max(1, Math.floor(count)), MAX_SERIAL_BATCH);
  for (let i = 0; i < n; i += 1) {
    const r = valueAt(config, offset + i, ctx);
    if (!r.ok) {
      const field: SerialIssue['field'] = r.reason === 'invalid-config' ? 'start' : 'overflow';
      err(field, i === 0 || r.reason === 'invalid-config' ? r.message : `Label ${i + 1}: ${r.message}`, i + 1);
      break;
    }
  }
  return issues;
}
