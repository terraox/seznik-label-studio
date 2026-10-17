import type { SerialConfig } from './types';

export type AlphabetResult =
  | { ok: true; chars: string[]; lookup: Map<string, number> }
  | { ok: false; message: string };

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

/**
 * The characters a kind counts with, in order, after case and exclusions.
 * Excluding characters shrinks the base: A-Z without I and O is base 24.
 */
export function resolveAlphabet(config: Pick<SerialConfig, 'kind' | 'alphabet' | 'excluded' | 'letterCase'>): AlphabetResult {
  let base: string[];
  let exact = false;
  switch (config.kind) {
    case 'letters':
      base = Array.from(UPPER);
      break;
    case 'alnum':
      base = Array.from(DIGITS + UPPER);
      break;
    case 'hex':
      base = Array.from(DIGITS + 'ABCDEF');
      break;
    case 'custom': {
      const raw = Array.from(config.alphabet ?? '');
      if (raw.length < 2) return { ok: false, message: 'The alphabet needs at least 2 different characters.' };
      if (new Set(raw).size !== raw.length) return { ok: false, message: 'The alphabet repeats a character. Each character may appear once.' };
      base = raw;
      exact = true;
      break;
    }
    default:
      return { ok: false, message: 'This type does not use an alphabet.' };
  }
  if (!exact && config.letterCase === 'lower') base = base.map((c) => c.toLowerCase());

  const excluded = new Set(Array.from(config.excluded ?? '').map((c) => (exact ? c : c.toUpperCase())));
  const chars = base.filter((c) => !excluded.has(exact ? c : c.toUpperCase()));
  if (chars.length < 2) {
    return { ok: false, message: 'The excluded characters leave fewer than 2 characters to count with.' };
  }
  const lookup = new Map<string, number>();
  chars.forEach((c, i) => {
    lookup.set(c, i);
    if (!exact) {
      lookup.set(c.toUpperCase(), i);
      lookup.set(c.toLowerCase(), i);
    }
  });
  return { ok: true, chars, lookup };
}

/** Positional numeral of `text` (first character = 0). Null when a character is outside the alphabet. */
export function fromPositional(text: string, lookup: Map<string, number>, base: number): bigint | null {
  if (!text) return null;
  let n = 0n;
  const b = BigInt(base);
  for (const ch of Array.from(text)) {
    const idx = lookup.get(ch);
    if (idx === undefined) return null;
    n = n * b + BigInt(idx);
  }
  return n;
}

/** Positional numeral of n (>= 0), left-padded with the zero character to `width`. */
export function toPositional(n: bigint, chars: string[], width: number): string {
  const b = BigInt(chars.length);
  const out: string[] = [];
  let v = n;
  if (v === 0n) out.push(chars[0]);
  while (v > 0n) {
    out.push(chars[Number(v % b)]);
    v /= b;
  }
  while (out.length < width) out.push(chars[0]);
  return out.reverse().join('');
}

/** Spreadsheet-column ordinal (A=1, Z=26, AA=27). Null when a character is outside the alphabet. */
export function fromBijective(text: string, lookup: Map<string, number>, base: number): bigint | null {
  if (!text) return null;
  let n = 0n;
  const b = BigInt(base);
  for (const ch of Array.from(text)) {
    const idx = lookup.get(ch);
    if (idx === undefined) return null;
    n = n * b + BigInt(idx + 1);
  }
  return n;
}

/** Inverse of fromBijective for n >= 1. */
export function toBijective(n: bigint, chars: string[]): string {
  const b = BigInt(chars.length);
  const out: string[] = [];
  let v = n;
  while (v > 0n) {
    v -= 1n;
    out.push(chars[Number(v % b)]);
    v /= b;
  }
  return out.reverse().join('');
}

/** Number of ordinals shorter than `length` characters in a bijective system: N + N^2 + ... + N^(length-1). */
export function bijectiveFirstOrdinal(length: number, base: number): bigint {
  const b = BigInt(base);
  return (b ** BigInt(length) - b) / (b - 1n) + 1n;
}

/** Last ordinal that is exactly `length` characters long. */
export function bijectiveLastOrdinal(length: number, base: number): bigint {
  const b = BigInt(base);
  return (b ** BigInt(length + 1) - b) / (b - 1n);
}
