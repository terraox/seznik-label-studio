import { create } from 'zustand';

import {
  JOSH_PROGRESS_IDLE,
  applyJoshProgressEvent,
  type JoshProgressState,
} from '@/lib/printer/josh-status';

type JoshProgressStore = JoshProgressState & {
  /** A failure that arrived after the print call had already returned. Shown once, then cleared. */
  lateFailure: string | null;
  /** Latest PrinterParam.printerStatus code from the live watcher. Null when not watching or not reported. */
  deviceStatus: number | null;
  setDeviceStatus: (code: number | null) => void;
  apply: (event: Parameters<typeof applyJoshProgressEvent>[1]) => void;
  begin: () => void;
  finish: () => void;
  fail: (message: string) => void;
  setBulk: (index: number | null, total: number | null) => void;
  setLateFailure: (message: string | null) => void;
  reset: () => void;
};

export const useJoshProgressStore = create<JoshProgressStore>((set) => ({
  ...JOSH_PROGRESS_IDLE,
  lateFailure: null,
  deviceStatus: null,
  setDeviceStatus: (deviceStatus) => set({ deviceStatus }),
  apply: (event) => set((s) => applyJoshProgressEvent(s, event)),
  begin: () => set((s) => ({ ...s, phase: 'sending', copy: null, copies: null, failure: null })),
  finish: () => set((s) => (s.phase === 'failed' ? s : { ...s, phase: 'done' })),
  fail: (message) => set((s) => ({ ...s, phase: 'failed', failure: message })),
  setBulk: (bulkIndex, bulkTotal) => set((s) => ({ ...s, bulkIndex, bulkTotal })),
  setLateFailure: (lateFailure) => set({ lateFailure }),
  reset: () => set({ ...JOSH_PROGRESS_IDLE }),
}));
