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

let clearTimer: ReturnType<typeof setTimeout> | null = null;
const DONE_VISIBLE_MS = 2500;

export const useJoshProgressStore = create<JoshProgressStore>((set, get) => ({
  ...JOSH_PROGRESS_IDLE,
  lateFailure: null,
  deviceStatus: null,
  setDeviceStatus: (deviceStatus) => set({ deviceStatus }),
  apply: (event) => set((s) => applyJoshProgressEvent(s, event)),
  begin: () => {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = null;
    set((s) => ({ ...s, phase: 'sending', copy: null, copies: null, copiesDone: 0, failure: null }));
  },
  finish: () => {
    set((s) => (s.phase === 'failed' ? s : { ...s, phase: 'done' }));
    // Show "Done" briefly, then clear so the bar never lingers while the printer sits idle.
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      clearTimer = null;
      if (get().phase === 'done') set({ ...JOSH_PROGRESS_IDLE });
    }, DONE_VISIBLE_MS);
  },
  fail: (message) => set((s) => ({ ...s, phase: 'failed', failure: message })),
  setBulk: (bulkIndex, bulkTotal) => set((s) => ({ ...s, bulkIndex, bulkTotal })),
  setLateFailure: (lateFailure) => set({ lateFailure }),
  reset: () => set({ ...JOSH_PROGRESS_IDLE }),
}));
