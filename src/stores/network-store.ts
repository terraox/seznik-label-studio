import { create } from 'zustand';

type NetworkState = {
  /** False once the phone has no working internet (data off, no Wi-Fi, or Wi-Fi without internet). */
  online: boolean;
  /** A check is running; the banner shows a spinner on its Retry button. */
  checking: boolean;
  setOnline: (online: boolean) => void;
  setChecking: (checking: boolean) => void;
};

export const useNetworkStore = create<NetworkState>()((set) => ({
  online: true,
  checking: false,
  setOnline: (online) => set({ online }),
  setChecking: (checking) => set({ checking }),
}));

/** Last known state, for code outside React (downloads, link opens). */
export const isOnline = (): boolean => useNetworkStore.getState().online;
