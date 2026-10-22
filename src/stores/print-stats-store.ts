import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { bindPrintTotals, trackPrint, type PrintSource } from '@/lib/telemetry/events';
import { usePrinterStore } from '@/stores/printer-store';

/** What was printed, so the admin desk can rank label sizes and templates. */
export type PrintRecordMeta = {
  widthMm: number;
  heightMm: number;
  source: PrintSource;
  templateId?: string | null;
  templateName?: string | null;
  /** Labels across the row (2 ups, 3 ups…); left out for a normal single label. */
  ups?: number;
};

/** Local calendar day `YYYY-MM-DD`. */
export function statsDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const KEEP_DAYS = 8;

type PrintStatsState = {
  /** Every label printed on this phone since install (survives clearing print history). Used until the server total is known. */
  lifetime: number;
  /** Labels the server has counted for this account, from the last sign-in or sync. */
  serverTotal: number | null;
  /** Labels printed but still waiting in the send queue. Not stored: rebuilt from the queue at start. */
  pending: number;
  /** Labels printed per local day, trimmed to the last few days. */
  byDay: Record<string, number>;
  /** True once counts were seeded from the existing print history. */
  seeded: boolean;
  record: (copies: number, at?: number, meta?: PrintRecordMeta) => void;
  seed: (entries: { copies: number; printedAt: number }[]) => void;
};

function trim(byDay: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < KEEP_DAYS; i++) {
    const key = statsDayKey(now - i * 86_400_000);
    if (byDay[key]) out[key] = byDay[key];
  }
  return out;
}

export const usePrintStatsStore = create<PrintStatsState>()(
  persist(
    (set) => ({
      lifetime: 0,
      serverTotal: null,
      pending: 0,
      byDay: {},
      seeded: false,
      record: (copies, at = Date.now(), meta) => {
        if (meta) {
          const printer = usePrinterStore.getState();
          trackPrint(copies, { ...meta, printerName: printer.deviceName, sdkFamily: printer.sdkId });
        }
        set((s) => {
          const n = Math.max(1, Math.floor(copies) || 1);
          const key = statsDayKey(at);
          return {
            lifetime: s.lifetime + n,
            byDay: trim({ ...s.byDay, [key]: (s.byDay[key] ?? 0) + n }, Date.now()),
          };
        });
      },
      seed: (entries) =>
        set((s) => {
          if (s.seeded) return s;
          const byDay = { ...s.byDay };
          let total = 0;
          for (const e of entries) {
            const n = Math.max(1, Math.floor(e.copies) || 1);
            total += n;
            const key = statsDayKey(e.printedAt);
            byDay[key] = (byDay[key] ?? 0) + n;
          }
          return { seeded: true, lifetime: s.lifetime + total, byDay: trim(byDay, Date.now()) };
        }),
    }),
    {
      name: 'sez-print/print-stats',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lifetime: s.lifetime, serverTotal: s.serverTotal, byDay: s.byDay, seeded: s.seeded }),
    },
  ),
);

bindPrintTotals(
  (pending) => usePrintStatsStore.setState({ pending }),
  (serverTotal) => usePrintStatsStore.setState({ serverTotal }),
);

/** The number every screen shows: what the server counted plus what is still queued, so phone and admin agree. */
export const selectLifetime = (s: Pick<PrintStatsState, 'lifetime' | 'serverTotal' | 'pending'>) =>
  s.serverTotal === null ? s.lifetime : s.serverTotal + s.pending;

/** Labels printed today and over the last 7 days (today included). */
export function printCounts(byDay: Record<string, number>, now = Date.now()) {
  let week = 0;
  for (let i = 0; i < 7; i++) week += byDay[statsDayKey(now - i * 86_400_000)] ?? 0;
  return { today: byDay[statsDayKey(now)] ?? 0, week };
}
