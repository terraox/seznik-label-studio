import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * "Continue from last printed", kept per label id and deliberately OUTSIDE the label document, so a
 * clone, Save As, share, upload or template save can never carry it.
 */
export type ContinueEntry = { enabled: boolean; offset: number };

type ContinueState = {
  byLabel: Record<string, ContinueEntry>;
  get: (labelId: string) => ContinueEntry;
  setEnabled: (labelId: string, enabled: boolean) => void;
  setOffset: (labelId: string, offset: number) => void;
  reset: (labelId: string) => void;
  forget: (labelId: string) => void;
};

const EMPTY: ContinueEntry = { enabled: false, offset: 0 };

export const useSerialContinueStore = create<ContinueState>()(
  persist(
    (set, get) => ({
      byLabel: {},
      get: (labelId) => get().byLabel[labelId] ?? EMPTY,
      setEnabled: (labelId, enabled) =>
        set((s) => ({ byLabel: { ...s.byLabel, [labelId]: { ...(s.byLabel[labelId] ?? EMPTY), enabled } } })),
      setOffset: (labelId, offset) =>
        set((s) => ({
          byLabel: { ...s.byLabel, [labelId]: { ...(s.byLabel[labelId] ?? EMPTY), offset: Math.max(0, Math.floor(offset)) } },
        })),
      reset: (labelId) =>
        set((s) => ({ byLabel: { ...s.byLabel, [labelId]: { ...(s.byLabel[labelId] ?? EMPTY), offset: 0 } } })),
      forget: (labelId) =>
        set((s) => {
          const { [labelId]: _gone, ...rest } = s.byLabel;
          return { byLabel: rest };
        }),
    }),
    { name: 'serial-continue', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Offset a batch should start from: 0 unless the toggle is on. */
export function continueOffsetFor(labelId: string | undefined): number {
  if (!labelId) return 0;
  const e = useSerialContinueStore.getState().byLabel[labelId];
  return e?.enabled ? e.offset : 0;
}
