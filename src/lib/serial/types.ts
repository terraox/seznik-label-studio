/**
 * Serial labels: shared types. Pure TypeScript, no React Native imports, so
 * everything under src/lib/serial runs in node tests.
 */

export type SerialKind = 'number' | 'decimal' | 'letters' | 'alnum' | 'hex' | 'custom';
export type SerialOverflow = 'extend' | 'wrap' | 'stop';
export type SerialCheckDigit = 'none' | 'mod10' | 'symbology';
export type SerialRounding = 'half-up' | 'down';

/** One serial field = one config attached to one element's content. */
export interface SerialConfig {
  /** Schema version. */
  v: 1;
  /** Stable field id. Not the element id, so it survives cloning panels. */
  id: string;
  kind: SerialKind;
  /** Exact text: "1", "0042", "12.50", "AA", "7F". */
  start: string;
  /** Exact signed whole number for every kind except decimal ("-5", "0.25"). */
  step: string;
  prefix?: string;
  suffix?: string;
  /** Pad width of the value part (prefix and suffix excluded). Number, Decimal, Alnum, Hex, Custom. */
  minWidth?: number;
  /** Single pad character. Number and Decimal only (default "0"). */
  padChar?: string;
  /** Decimal kind only, 0..8. */
  decimals?: number;
  /** Applied once when start/step are parsed, never per step. */
  rounding?: SerialRounding;
  /** Letters, Alnum and Hex. */
  letterCase?: 'upper' | 'lower';
  /** Characters to skip, e.g. "IOQ". */
  excluded?: string;
  /** Custom kind: the alphabet; its length is the base. */
  alphabet?: string;
  /** Same value on N consecutive labels. Default 1. */
  repeatEach?: number;
  /** What happens when a value runs past its width. Default 'extend'. */
  overflow?: SerialOverflow;
  checkDigit?: SerialCheckDigit;
  /** Another field's id on the same label ("same serial as"). */
  linkTo?: string;
}

/** Label-level batch settings stored in the document. continueOffset is NOT here (see serial-continue-store). */
export interface SerialBatch {
  v: 1;
  /** Number of LABELS in the batch (not distinct values). */
  count: number;
}

/** Facts about the element that carries a field, needed for check digits. */
export interface SerialContext {
  /** Barcode encode mode, e.g. 'EAN-13'. */
  encodeMode?: string;
}

export type SerialFailReason = 'overflow' | 'underflow' | 'invalid-config';

export type SerialResult =
  | { ok: true; value: string }
  | { ok: false; reason: SerialFailReason; message: string };

export interface SerialIssue {
  field: keyof SerialConfig | 'count';
  message: string;
  severity: 'error' | 'warning';
  /** 1-based label number the problem was found at, when it is about one value. */
  label?: number;
}

export const MAX_SERIAL_BATCH = 5000;
export const SERIAL_CONFIRM_ABOVE = 500;
export const DEFAULT_SERIAL_COUNT = 10;
