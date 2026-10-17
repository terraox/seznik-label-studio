import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SerialJobCursor } from '@/lib/serial/job';

/** Resume cursor per label id. Written after every confirmed label. */
type JobState = {
  byLabel: Record<string, SerialJobCursor>;
  save: (cursor: SerialJobCursor) => void;
  clear: (labelId: string) => void;
};

export const useSerialJobStore = create<JobState>()(
  persist(
    (set) => ({
      byLabel: {},
      save: (cursor) => set((s) => ({ byLabel: { ...s.byLabel, [cursor.labelId]: cursor } })),
      clear: (labelId) =>
        set((s) => {
          const { [labelId]: _gone, ...rest } = s.byLabel;
          return { byLabel: rest };
        }),
    }),
    { name: 'serial-job', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
