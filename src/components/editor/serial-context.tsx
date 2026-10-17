import { createContext, useContext } from 'react';

import type { SerialConfig, SerialContext } from '@/lib/serial/types';

export type SerialLinkOption = { id: string; label: string };

/** Label-level facts the Serial settings need, supplied by the editor. */
export interface SerialEditorValue {
  /** Labels in the batch. */
  count: number;
  setCount: (count: number) => void;
  /** Excel / bulk labels use the row index, so Count is hidden. */
  isBulk: boolean;
  /** Set when serial cannot be used on this label (multi-up). Shown instead of the settings. */
  blockedReason: string | null;
  /** Fields this one could be linked to ("same serial as"). */
  linkOptions: (excludeFieldId: string) => SerialLinkOption[];
  /** Connected printer DPI, for the barcode width-fit check. */
  printerDpi: number | null;
  /** Every serial field on the label, by field id (for "same serial as" and the batch checks). */
  configs: Record<string, SerialConfig>;
  contexts: Record<string, SerialContext>;
  /** Continue-from-last offset a print would start at (0 when off). */
  offset: number;
  /** Adds a barcode that carries the same serial and makes this field follow it. */
  addLinkedBarcode?: (fieldId: string) => void;
}

const NOOP: SerialEditorValue = {
  count: 10,
  setCount: () => {},
  isBulk: false,
  blockedReason: null,
  linkOptions: () => [],
  printerDpi: null,
  configs: {},
  contexts: {},
  offset: 0,
};

export const SerialEditorContext = createContext<SerialEditorValue>(NOOP);
export const useSerialEditor = () => useContext(SerialEditorContext);
