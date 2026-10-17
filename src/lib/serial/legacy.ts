import { applySerialOffset } from '@/lib/serial-content';
import type { SerialConfig } from './types';

/**
 * Old Counter / Degrees elements (contentType 'Degrees', no `serial`) keep printing through
 * applySerialOffset exactly as before. This adapter only DERIVES an equivalent config for the
 * "Upgrade to new Serial" action and for equivalence tests; nothing resolves legacy elements with it.
 */
export function legacyToSerial(content: string, degreesOffset: number, id: string): SerialConfig | null {
  const m = /^(\D*)(\d+)(\D*)$/.exec(content);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  return {
    v: 1,
    id,
    kind: 'number',
    start: digits,
    step: String(degreesOffset),
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
    minWidth: digits.length,
    overflow: 'extend',
  };
}

/** What a legacy element shows at `pageIndex` today (unchanged function, re-exported for tests and logs). */
export function legacyValue(content: string, degreesOffset: number, pageIndex: number): string {
  return applySerialOffset(content, degreesOffset, pageIndex);
}

let fieldCounter = 0;
export function newSerialFieldId(): string {
  fieldCounter += 1;
  return `sf_${Date.now().toString(36)}_${fieldCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Starting config for a new Serial element, seeded from the element's current text when it has digits. */
export function defaultSerialConfig(seedText?: string): SerialConfig {
  const base: SerialConfig = { v: 1, id: newSerialFieldId(), kind: 'number', start: '1', step: '1', overflow: 'extend' };
  const seed = (seedText ?? '').trim();
  if (!seed) return base;
  const m = /^(.*?)(\d+)(\D*)$/s.exec(seed);
  if (m) {
    return {
      ...base,
      start: m[2],
      ...(m[1] ? { prefix: m[1] } : {}),
      ...(m[3] ? { suffix: m[3] } : {}),
    };
  }
  return { ...base, prefix: seed };
}
