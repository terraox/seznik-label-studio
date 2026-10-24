import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { trackFeedback, type FeedbackKind, type FeedbackPayload } from '@/lib/telemetry/events';

/** Lifetime label count at which the feedback popup first appears. */
export const FEEDBACK_FIRST_AT = 100;
/** After "Not now", ask again once this many more labels have printed. */
export const FEEDBACK_SNOOZE_STEP = 100;

export type FeedbackEntry = {
  kind: FeedbackKind;
  title: string;
  text: string;
  printerName: string | null;
  at: number;
  /** Lifetime label count when it was given. */
  labels: number;
};

type FeedbackState = {
  /** Lifetime count that triggers the next popup; null once feedback was given. */
  nextAt: number | null;
  entry: FeedbackEntry | null;
  submit: (payload: FeedbackPayload, labels: number) => void;
  snooze: (labels: number) => void;
};

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set) => ({
      nextAt: FEEDBACK_FIRST_AT,
      entry: null,
      submit: (payload, labels) => {
        trackFeedback(payload);
        set({
          nextAt: null,
          entry: {
            kind: payload.kind,
            title: payload.title.trim(),
            text: payload.message.trim(),
            printerName: payload.printerName?.trim() || null,
            at: Date.now(),
            labels,
          },
        });
      },
      snooze: (labels) => set({ nextAt: labels + FEEDBACK_SNOOZE_STEP }),
    }),
    { name: 'sez-print/feedback', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
