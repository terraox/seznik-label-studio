import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Lifetime label count at which the feedback popup first appears. */
export const FEEDBACK_FIRST_AT = 100;
/** After "Not now", ask again once this many more labels have printed. */
export const FEEDBACK_SNOOZE_STEP = 100;

export type FeedbackEntry = {
  rating: number;
  text: string;
  at: number;
  /** Lifetime label count when it was given. */
  labels: number;
};

type FeedbackState = {
  /** Lifetime count that triggers the next popup; null once feedback was given. */
  nextAt: number | null;
  entry: FeedbackEntry | null;
  submit: (rating: number, text: string, labels: number) => void;
  snooze: (labels: number) => void;
};

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set) => ({
      nextAt: FEEDBACK_FIRST_AT,
      entry: null,
      submit: (rating, text, labels) =>
        set({
          nextAt: null,
          entry: { rating: Math.min(5, Math.max(1, Math.round(rating))), text: text.trim(), at: Date.now(), labels },
        }),
      snooze: (labels) => set({ nextAt: labels + FEEDBACK_SNOOZE_STEP }),
    }),
    { name: 'sez-print/feedback', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
