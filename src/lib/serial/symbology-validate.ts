/**
 * Barcode / QR validation for serial values. Pure TypeScript.
 *
 * Character-set symbologies (Code 39, Code 128) are validated EXACTLY: prefix, suffix and the alphabet
 * are checked character by character, and a string gate checks every value in the batch, so a bad value
 * fails before label 1, not at label 38. Sampling is not used; the only approximation is the width
 * estimate, which uses the longest value.
 */

import {
  barcodeModulesForMode,
  encodeModeToSymbology,
} from '@/lib/barcode-code128';
import { snap1DBarcodeModules } from '@/lib/barcode/barcode-snapping';
import { generateQrMatrix } from '@/printing/renderer/qrcode';
import { resolveAlphabet } from './alphabet';
import { checkDigitPayloadLength, gs1CheckDigit } from './check-digit';
import { longestValue, resolveField, validateConfig } from './engine';
import {
  collectSerialFields,
  serialMaps,
  type SerialFieldRef,
} from './resolve-document';
import type { SerialConfig, SerialIssue } from './types';

const DEFAULT_DPI = 203;
const CODE39_RE = /^[0-9A-Z\-. $/+%]$/;

/** Why `value` cannot be encoded in `mode`, or null when it can. */
export function barcodeValueProblem(mode: string, value: string): string | null {
  if (!value) return 'The value is empty.';
  switch (mode) {
    case 'CODE-39': {
      for (const ch of Array.from(value)) {
        if (ch === '*') return "Code 39 cannot print '*' (it is the start/stop mark).";
        if (!CODE39_RE.test(ch)) {
          return /[a-z]/.test(ch)
            ? `Code 39 cannot print lowercase '${ch}'. Use capital letters or switch to Code 128.`
            : `Code 39 cannot print '${ch}'.`;
        }
      }
      return null;
    }
    case 'ITF': {
      if (!/^\d+$/.test(value)) return 'ITF only prints digits.';
      if (value.length < 2) return 'ITF needs at least 2 digits.';
      if (value.length % 2 === 1) return `ITF needs an even number of digits, but "${value}" has ${value.length}.`;
      return null;
    }
    case 'EAN-13':
    case 'UPC-A':
    case 'EAN-8': {
      const payload = checkDigitPayloadLength(mode)!;
      if (!/^\d+$/.test(value)) return `${mode} only prints digits.`;
      if (value.length !== payload && value.length !== payload + 1) {
        return `${mode} needs ${payload} digits (a check digit is added) or ${payload + 1} with its check digit, but "${value}" has ${value.length}.`;
      }
      if (value.length === payload + 1 && gs1CheckDigit(value.slice(0, payload)) !== Number(value[payload])) {
        return `The check digit of "${value}" is wrong (it should be ${gs1CheckDigit(value.slice(0, payload))}).`;
      }
      return null;
    }
    default: {
      for (const ch of Array.from(value)) {
        const code = ch.charCodeAt(0);
        if (code < 32 || code > 126) return `Code 128 cannot print '${ch}'.`;
      }
      return null;
    }
  }
}

function charAllowed(mode: string, ch: string): boolean {
  switch (mode) {
    case 'CODE-39':
      return CODE39_RE.test(ch);
    case 'ITF':
    case 'EAN-13':
    case 'UPC-A':
    case 'EAN-8':
      return /^\d$/.test(ch);
    default: {
      const c = ch.charCodeAt(0);
      return c >= 32 && c <= 126;
    }
  }
}

/** Every character a config can ever produce, checked against the symbology (exact, no sampling). */
export function barcodeCharsetIssues(mode: string, config: SerialConfig): SerialIssue[] {
  const issues: SerialIssue[] = [];
  const name = mode === 'CODE-128' || !mode ? 'Code 128' : mode.replace('-', ' ');
  const bad = (field: SerialIssue['field'], ch: string, where: string, fix?: SerialIssue['fix']) =>
    issues.push({ field, severity: 'error', message: `${where} has '${ch}', which ${name} cannot print.`, ...(fix ? { fix } : {}) });

  for (const ch of Array.from(config.prefix ?? '')) {
    if (!charAllowed(mode, ch)) {
      bad('prefix', ch, 'The prefix');
      break;
    }
  }
  for (const ch of Array.from(config.suffix ?? '')) {
    if (!charAllowed(mode, ch)) {
      bad('suffix', ch, 'The suffix');
      break;
    }
  }
  const core: string[] = [];
  if (config.kind === 'number' || config.kind === 'decimal') {
    core.push(...'0123456789');
    if (config.kind === 'decimal') core.push('.');
    if (config.start.trim().startsWith('-') || config.step.trim().startsWith('-')) core.push('-');
    const pad = config.padChar && config.padChar.length ? config.padChar : '0';
    core.push(pad);
  } else {
    const alpha = resolveAlphabet(config);
    if (alpha.ok) core.push(...alpha.chars);
  }
  for (const ch of core) {
    if (!charAllowed(mode, ch)) {
      const lowerFix =
        mode === 'CODE-39' && /[a-z]/.test(ch) && config.kind !== 'custom' && config.kind !== 'number' && config.kind !== 'decimal'
          ? { label: 'Use capital letters', serial: { ...config, letterCase: 'upper' as const } }
          : undefined;
      bad(config.kind === 'custom' ? 'alphabet' : 'kind', ch, 'The value', lowerFix);
      break;
    }
  }
  return issues;
}

export interface BadValue {
  label: number;
  value: string;
  message: string;
}

/**
 * The string gate: checks EVERY value in labels [offset, offset+count) with `check`.
 * Returns the first problem (an engine failure counts), or null when all are fine.
 */
export function validateAllValues(
  configs: Record<string, SerialConfig>,
  id: string,
  count: number,
  offset: number,
  contexts: Record<string, { encodeMode?: string }>,
  check: (value: string) => string | null,
): BadValue | null {
  for (let i = 0; i < count; i += 1) {
    const r = resolveField(configs, id, offset + i, contexts);
    if (!r.ok) return { label: i + 1, value: '', message: r.message };
    const problem = check(r.value);
    if (problem) return { label: i + 1, value: r.value, message: problem };
  }
  return null;
}

/** ITF / EAN / UPC fix: pad the numeric value so every label has a valid digit count. */
function lengthFix(mode: string, config: SerialConfig, longest: string | null): SerialIssue['fix'] | undefined {
  if (config.kind !== 'number' || !longest || !/^\d+$/.test(longest)) return undefined;
  // 'symbology' appends its digit only after the payload, so only Mod 10 counts toward the total length.
  const fixed = (config.prefix ?? '').length + (config.suffix ?? '').length + (config.checkDigit === 'mod10' ? 1 : 0);
  if (!/^\d*$/.test((config.prefix ?? '') + (config.suffix ?? ''))) return undefined;
  let target = longest.length;
  if (mode === 'ITF') {
    if (target % 2 === 1) target += 1;
  } else {
    const need = checkDigitPayloadLength(mode);
    if (need === null || longest.length >= need) return undefined;
    target = need;
  }
  const width = target - fixed;
  if (width < 1 || width === config.minWidth) return undefined;
  return { label: `Pad to ${target} digits`, serial: { ...config, minWidth: width } };
}

export interface BarcodeFit {
  fits: boolean;
  xDimensionMm: number;
  requiredMm: number;
  scannability: 'optimal' | 'marginal' | 'sub-optical';
}

/** Width fit of one value inside `widthMm` at `dpi`, using the same module snapping as the renderer. */
export function barcodeWidthFit(mode: string, value: string, widthMm: number, dpi = DEFAULT_DPI): BarcodeFit | null {
  const modules = barcodeModulesForMode(mode, value);
  if (!modules) return null;
  const data = modules.reduce((a, b) => a + b, 0);
  const dotsPerMm = dpi / 25.4;
  const available = Math.max(1, Math.round(widthMm * dotsPerMm));
  const snapped = snap1DBarcodeModules(modules, widthMm, dpi, false);
  if (!snapped) return null;
  return {
    fits: available >= data,
    xDimensionMm: snapped.xDimensionMm,
    requiredMm: Math.round((data / dotsPerMm) * 100) / 100,
    scannability: snapped.scannability,
  };
}

export function barcodeSerialIssues(p: {
  mode: string;
  config: SerialConfig;
  configs: Record<string, SerialConfig>;
  contexts: Record<string, { encodeMode?: string }>;
  count: number;
  offset: number;
  widthMm: number;
  dpi?: number;
}): SerialIssue[] {
  const issues: SerialIssue[] = [];
  const root = p.config.linkTo ? p.configs[p.config.linkTo] : p.config;
  if (root && !p.config.linkTo) issues.push(...barcodeCharsetIssues(p.mode, root));
  if (issues.some((i) => i.severity === 'error')) return issues;

  const longest = root ? longestValue(root, p.count, p.offset, p.contexts[root.id]) : null;
  const bad = validateAllValues(p.configs, p.config.id, p.count, p.offset, p.contexts, (v) => barcodeValueProblem(p.mode, v));
  if (bad) {
    const fix = root ? lengthFix(p.mode, root, longest) : undefined;
    issues.push({
      field: 'start',
      severity: 'error',
      label: bad.label,
      message: bad.value ? `Label ${bad.label}: ${bad.message}` : `Label ${bad.label}: ${bad.message}`,
      ...(fix && !p.config.linkTo ? { fix } : {}),
    });
    return issues;
  }

  const wide = longest ?? '';
  if (wide) {
    const fit = barcodeWidthFit(p.mode, wide, p.widthMm, p.dpi ?? DEFAULT_DPI);
    if (fit && !fit.fits) {
      issues.push({
        field: 'prefix',
        severity: 'error',
        message: `The longest value ("${wide}") needs about ${fit.requiredMm} mm but the barcode is ${Math.round(p.widthMm * 10) / 10} mm. Shorten the prefix, use a narrower barcode type, or make the barcode or label wider.`,
      });
    } else if (fit && fit.scannability !== 'optimal') {
      issues.push({
        field: 'prefix',
        severity: 'warning',
        message: `The longest value ("${wide}") makes the bars thin (${Math.round(fit.xDimensionMm * 1000) / 1000} mm), which some scanners struggle with. A shorter prefix or a wider barcode helps.`,
      });
    }
  }
  return issues;
}

const QR_MODE_MAX_BYTES: Record<string, number> = { PDF417: 1850, DataMatrix: 2335 };

export function qrValueProblem(mode: string, level: string, value: string): string | null {
  if (!value) return 'The value is empty.';
  if (mode === 'QRCode') {
    return generateQrMatrix(value, (level as 'L' | 'M' | 'Q' | 'H') || 'M')
      ? null
      : `"${value.length > 24 ? value.slice(0, 24) + '...' : value}" is too long for a QR code at error level ${level || 'M'}.`;
  }
  const bytes = new TextEncoder().encode(value).length;
  const max = QR_MODE_MAX_BYTES[mode] ?? 1850;
  return bytes > max ? `The value is ${bytes} bytes; ${mode} holds about ${max}.` : null;
}

export function qrSerialIssues(p: {
  mode: string;
  level: string;
  zoneSize?: string;
  config: SerialConfig;
  configs: Record<string, SerialConfig>;
  contexts: Record<string, { encodeMode?: string }>;
  count: number;
  offset: number;
  widthMm: number;
  dpi?: number;
}): SerialIssue[] {
  const bad = validateAllValues(p.configs, p.config.id, p.count, p.offset, p.contexts, (v) => qrValueProblem(p.mode, p.level, v));
  if (bad) return [{ field: 'start', severity: 'error', label: bad.label, message: `Label ${bad.label}: ${bad.message}` }];
  const root = p.config.linkTo ? p.configs[p.config.linkTo] : p.config;
  const wide = root ? longestValue(root, p.count, p.offset, p.contexts[root.id]) : null;
  if (!wide || p.mode !== 'QRCode') return [];
  const matrix = generateQrMatrix(wide, (p.level as 'L' | 'M' | 'Q' | 'H') || 'M');
  if (!matrix) return [];
  const zone = Math.max(0, parseInt(p.zoneSize ?? '0', 10) || 0);
  const dotsPerMm = (p.dpi ?? DEFAULT_DPI) / 25.4;
  const moduleDots = (p.widthMm * dotsPerMm) / (matrix.size + zone * 2);
  if (moduleDots < 1) {
    return [{ field: 'prefix', severity: 'error', message: `The longest value ("${wide}") needs a ${matrix.size}-module QR code, too dense for ${Math.round(p.widthMm * 10) / 10} mm. Shorten the value or make the QR code bigger.` }];
  }
  if (moduleDots < 2.5) {
    return [{ field: 'prefix', severity: 'warning', message: `The longest value ("${wide}") makes a dense ${matrix.size}-module QR code that may be hard to scan at this size. A bigger QR code or a shorter value helps.` }];
  }
  return [];
}

export interface GateResult {
  issues: SerialIssue[];
  /** Problems per element id, for pointing the user at the right element. */
  byElement: Record<string, SerialIssue[]>;
}

/**
 * The print gate: every field, every label. Run before label 1 is sent. Uses the connected printer's
 * DPI when there is one, so width-fit matches the head that will print.
 */
export function serialPrintGate(
  doc: { elements: import('@/lib/label-document').LabelElement[] },
  count: number,
  offset: number,
  dpi: number | null,
): GateResult {
  const fields = collectSerialFields(doc);
  const { configs, contexts } = serialMaps(fields);
  const byElement: Record<string, SerialIssue[]> = {};
  const issues: SerialIssue[] = [];
  const add = (f: SerialFieldRef, list: SerialIssue[]) => {
    const errors = list.filter((i) => i.severity === 'error');
    if (!errors.length) return;
    (byElement[f.elementId] ??= []).push(...errors);
    issues.push(...errors);
  };
  for (const f of fields) {
    const ctx = contexts[f.config.id];
    const own = validateConfig(f.config, count, offset, ctx);
    if (own.some((i) => i.severity === 'error')) {
      add(f, own);
      continue;
    }
    const el = doc.elements.find((e) => e.id === f.elementId);
    if (f.type === 'barcode' && el && el.type === 'barcode') {
      add(f, barcodeSerialIssues({ mode: el.encodeMode, config: f.config, configs, contexts, count, offset, widthMm: el.width, dpi: dpi ?? DEFAULT_DPI }));
    } else if (f.type === 'qrcode' && el && el.type === 'qrcode') {
      add(f, qrSerialIssues({ mode: el.encodeMode, level: el.errorLevel, zoneSize: el.zoneSize, config: f.config, configs, contexts, count, offset, widthMm: el.width, dpi: dpi ?? DEFAULT_DPI }));
    } else {
      const bad = validateAllValues(configs, f.config.id, count, offset, contexts, () => null);
      if (bad) add(f, [{ field: 'start', severity: 'error', label: bad.label, message: `Label ${bad.label}: ${bad.message}` }]);
    }
  }
  return { issues, byElement };
}

export { encodeModeToSymbology };
