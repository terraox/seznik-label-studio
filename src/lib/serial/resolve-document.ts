/**
 * Document-level serial resolution. resolveDocumentForIndex is the ONE function the editor preview and
 * the print path use to turn a label design into the label for a given index.
 *
 * A field is "active" when the element has a `serial` config AND contentType === 'Degrees' (the stored
 * value never changes). Legacy Counters (no `serial`) are never touched here: they keep printing through
 * applySerialOffset exactly as before.
 */

import type { LabelDocument, LabelElement } from '@/lib/label-document';
import { resolveField, rootOf } from './engine';
import {
  MAX_SERIAL_BATCH,
  type SerialConfig,
  type SerialContext,
  type SerialIssue,
} from './types';

/** Where an element keeps the text a serial value replaces. */
export function serialContentKey(el: LabelElement): 'text' | 'content' | null {
  switch (el.type) {
    case 'text':
    case 'arctext':
      return 'text';
    case 'degrees':
    case 'barcode':
    case 'qrcode':
      return 'content';
    default:
      return null;
  }
}

type Carrier = { serial?: SerialConfig; contentType?: string };

export function isSerialActive(el: unknown): boolean {
  const c = el as Carrier;
  return Boolean(c && c.serial && c.contentType === 'Degrees');
}

export interface SerialFieldRef {
  /** Element id, plus table cell coordinates for table fields. */
  elementId: string;
  cell?: { row: number; col: number };
  config: SerialConfig;
  type: LabelElement['type'];
  context: SerialContext;
}

/** Every active serial field on the label, in element order. */
export function collectSerialFields(doc: Pick<LabelDocument, 'elements'>): SerialFieldRef[] {
  const out: SerialFieldRef[] = [];
  for (const el of doc.elements) {
    if (el.type === 'table') {
      el.cells?.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (isSerialActive(cell)) {
            out.push({ elementId: el.id, cell: { row: r, col: c }, config: (cell as Carrier).serial!, type: 'table', context: {} });
          }
        }),
      );
      continue;
    }
    if (!isSerialActive(el) || serialContentKey(el) === null) continue;
    const context: SerialContext = el.type === 'barcode' ? { encodeMode: el.encodeMode } : {};
    out.push({ elementId: el.id, config: (el as Carrier).serial!, type: el.type, context });
  }
  return out;
}

export function hasSerialFields(doc: Pick<LabelDocument, 'elements'>): boolean {
  return collectSerialFields(doc).length > 0;
}

export function serialMaps(fields: SerialFieldRef[]) {
  const configs: Record<string, SerialConfig> = {};
  const contexts: Record<string, SerialContext> = {};
  for (const f of fields) {
    if (!configs[f.config.id]) {
      configs[f.config.id] = f.config;
      contexts[f.config.id] = f.context;
    }
  }
  return { configs, contexts };
}

/** Number of labels in the batch: the saved count, clamped. */
export function serialBatchCount(doc: Pick<LabelDocument, 'serialBatch'>): number {
  // No Count setting any more: a counter can be stepped through as far as the engine allows.
  // A label made by the Serial Labels screen still carries its own count.
  const n = Math.floor(doc.serialBatch?.count ?? MAX_SERIAL_BATCH);
  return Math.max(1, Math.min(MAX_SERIAL_BATCH, Number.isFinite(n) ? n : MAX_SERIAL_BATCH));
}

/** Shown on the canvas for a field that cannot produce a value (the print gate blocks printing). */
export const SERIAL_ERROR_TEXT = '#ERR';

/**
 * The label for `serialIndex` (0-based, continue offset already added by the caller).
 * Returns the SAME object when the label has no serial fields, so non-serial labels are untouched.
 */
export function resolveDocumentForIndex(doc: LabelDocument, serialIndex: number): LabelDocument {
  const fields = collectSerialFields(doc);
  if (fields.length === 0) return doc;
  const { configs, contexts } = serialMaps(fields);
  const valueFor = (config: SerialConfig): string => {
    const r = resolveField(configs, config.id, serialIndex, contexts);
    return r.ok ? r.value : SERIAL_ERROR_TEXT;
  };
  const elements = doc.elements.map((el): LabelElement => {
    if (el.type === 'table') {
      if (!el.cells?.some((row) => row.some(isSerialActive))) return el;
      const cells = el.cells.map((row) =>
        row.map((cell) =>
          isSerialActive(cell)
            ? { ...cell, text: valueFor((cell as Carrier).serial!), contentType: 'Manual' as const }
            : cell,
        ),
      );
      return { ...el, cells } as LabelElement;
    }
    const key = serialContentKey(el);
    if (!key || !isSerialActive(el)) return el;
    // contentType 'Manual' on the clone: renderers then do not apply the legacy +step offset again.
    return { ...el, [key]: valueFor((el as Carrier).serial!), contentType: 'Manual' } as LabelElement;
  });
  return { ...doc, elements };
}

/** The distinct root fields, for the "same serial as" picker. */
export function linkCandidates(doc: Pick<LabelDocument, 'elements'>, excludeFieldId?: string): SerialFieldRef[] {
  const fields = collectSerialFields(doc);
  const { configs } = serialMaps(fields);
  return fields.filter((f) => f.config.id !== excludeFieldId && !f.config.linkTo && rootOf(configs, f.config.id)?.id === f.config.id);
}

/** Give copies of serial elements their own field ids so a duplicate never silently shares one. */
export function withFreshSerialIds<T extends LabelElement>(el: T, newId: () => string): T {
  const c = el as unknown as Carrier & { cells?: Carrier[][] };
  let next: T = el;
  if (c.serial) next = { ...next, serial: { ...c.serial, id: newId() } } as T;
  if (c.cells) {
    next = {
      ...next,
      cells: c.cells.map((row) => row.map((cell) => (cell.serial ? { ...cell, serial: { ...cell.serial, id: newId() } } : cell))),
    } as T;
  }
  return next;
}

export function issuesBlockPrint(issues: SerialIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** Short text of the values a label carries, for the `[serial-print]` log line. */
export function describeSerialValues(doc: Pick<LabelDocument, 'elements'>, serialIndex: number): string {
  const fields = collectSerialFields(doc);
  if (fields.length === 0) return '';
  const { configs, contexts } = serialMaps(fields);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fields) {
    if (seen.has(f.config.id)) continue;
    seen.add(f.config.id);
    const r = resolveField(configs, f.config.id, serialIndex, contexts);
    out.push(r.ok ? r.value : SERIAL_ERROR_TEXT);
  }
  return out.join(' | ');
}
