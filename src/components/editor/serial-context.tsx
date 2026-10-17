import { createContext, useContext } from 'react';

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
}

const NOOP: SerialEditorValue = {
  count: 10,
  setCount: () => {},
  isBulk: false,
  blockedReason: null,
  linkOptions: () => [],
  printerDpi: null,
};

export const SerialEditorContext = createContext<SerialEditorValue>(NOOP);
export const useSerialEditor = () => useContext(SerialEditorContext);
