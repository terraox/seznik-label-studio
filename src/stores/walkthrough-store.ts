import { create } from 'zustand';

/** Which tour is running. Each screen's overlay renders only for its own tour. */
export type WalkthroughTour = 'home' | 'canvas' | 'excel' | 'newLabel' | 'pdf' | 'printOrder';

type WalkthroughState = {
  active: boolean;
  tour: WalkthroughTour | null;
  stepIndex: number;
  start: (tour: WalkthroughTour) => void;
  stop: () => void;
  goTo: (index: number) => void;
};

/**
 * Runtime tour state (not persisted). First-run flags live in settings-store
 * (`tutorialSeen` for Home, `canvasTutorialSeen` for the label canvas,
 * `excelTutorialSeen` for Print Excel, `excelColumnsTutorialSeen` for Data Column).
 */
export const useWalkthroughStore = create<WalkthroughState>((set) => ({
  active: false,
  tour: null,
  stepIndex: 0,
  start: (tour) => set({ active: true, tour, stepIndex: 0 }),
  stop: () => set({ active: false, tour: null, stepIndex: 0 }),
  goTo: (stepIndex) => set({ stepIndex }),
}));
