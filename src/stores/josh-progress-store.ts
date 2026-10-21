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
  /** The print call returned; the printer may still be printing. Marks done after `ms` unless it finishes first. */
  settle: (ms: number) => void;
  fail: (message: string) => void;
  setBulk: (index: number | null, total: number | null) => void;
  setLateFailure: (message: string | null) => void;
  reset: () => void;
};

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
const DONE_VISIBLE_MS = 4000;

function stopTimers() {
  if (clearTimer) clearTimeout(clearTimer);
  if (settleTimer) clearTimeout(settleTimer);
  clearTimer = null;
  settleTimer = null;
}

/** Done is shown for a few seconds, then cleared so nothing lingers while the printer sits idle. */
function armClear(
  get: () => JoshProgressStore,
  set: (partial: Partial<JoshProgressStore>) => void,
) {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = null;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    if (get().phase === 'done') set({ ...JOSH_PROGRESS_IDLE });
  }, DONE_VISIBLE_MS);
}

export const useJoshProgressStore = create<JoshProgressStore>((set, get) => ({
  ...JOSH_PROGRESS_IDLE,
  lateFailure: null,
  deviceStatus: null,
  setDeviceStatus: (deviceStatus) => set({ deviceStatus }),
  apply: (event) => {
    set((s) => applyJoshProgressEvent(s, event));
    if (get().phase === 'done') armClear(get, set);
    else if (get().phase === 'failed') stopTimers();
  },
  begin: () => {
    stopTimers();
    set((s) => ({ ...s, phase: 'sending', copy: null, copies: null, copiesDone: 0, failure: null }));
  },
  settle: (ms) => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      const { phase } = get();
      if (phase === 'sending' || phase === 'printing') {
        set((s) => ({ ...s, phase: 'done', copiesDone: s.copies ?? s.copiesDone }));
        armClear(get, set);
      }
    }, ms);
  },
  fail: (message) => {
    stopTimers();
    set((s) => ({ ...s, phase: 'failed', failure: message }));
  },
  setBulk: (bulkIndex, bulkTotal) => set((s) => ({ ...s, bulkIndex, bulkTotal })),
  setLateFailure: (lateFailure) => set({ lateFailure }),
  reset: () => {
    stopTimers();
    set({ ...JOSH_PROGRESS_IDLE });
  },
}));
