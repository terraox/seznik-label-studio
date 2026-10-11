import { create } from 'zustand';

type WalkthroughState = {
  active: boolean;
  stepIndex: number;
  start: () => void;
  stop: () => void;
  goTo: (index: number) => void;
};

/** Runtime tour state (not persisted). First-run flag lives in settings-store `tutorialSeen`. */
export const useWalkthroughStore = create<WalkthroughState>((set) => ({
  active: false,
  stepIndex: 0,
  start: () => set({ active: true, stepIndex: 0 }),
  stop: () => set({ active: false, stepIndex: 0 }),
  goTo: (stepIndex) => set({ stepIndex }),
}));
