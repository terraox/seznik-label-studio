import type { SerialRounding } from './types';

export const pow10 = (n: number): bigint => 10n ** BigInt(n);

/**
 * Parse "-12.505" into a BigInt scaled by 10^decimals. Extra fraction digits are rounded ONCE
 * here (half-up on the magnitude, or truncated), never per step. Null when the text is not a number.
 */
export function parseScaled(text: string, decimals: number, rounding: SerialRounding = 'half-up'): bigint | null {
  const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const negative = m[1] === '-';
  const intPart = BigInt(m[2]);
  let frac = m[3] ?? '';
  let roundUp = false;
  if (frac.length > decimals) {
    roundUp = rounding === 'half-up' && Number(frac[decimals]) >= 5;
    frac = frac.slice(0, decimals);
  }
  frac = frac.padEnd(decimals, '0');
  let mag = intPart * pow10(decimals) + (frac ? BigInt(frac) : 0n);
  if (roundUp) mag += 1n;
  return negative ? -mag : mag;
}

/** Digits in the integer part of a scaled magnitude. */
export function integerDigits(scaledMagnitude: bigint, decimals: number): number {
  return (scaledMagnitude / pow10(decimals)).toString().length;
}

/** Width implied by leading zeros in the typed start ("0042" = 4), else 0. */
export function leadingZeroWidth(startText: string): number {
  const m = /^[+-]?(\d+)/.exec(startText.trim());
  if (!m) return 0;
  return m[1].length > 1 && m[1][0] === '0' ? m[1].length : 0;
}

/** Format a scaled value: sign, integer part padded to `width` with padChar, then the fraction. */
export function formatScaled(value: bigint, decimals: number, width: number, padChar: string): string {
  const negative = value < 0n;
  const mag = negative ? -value : value;
  const scale = pow10(decimals);
  let int = (mag / scale).toString();
  if (int.length < width) int = padChar.repeat(width - int.length) + int;
  let out = int;
  if (decimals > 0) out += '.' + (mag % scale).toString().padStart(decimals, '0');
  return negative && mag !== 0n ? `-${out}` : out;
}
