import { create } from 'zustand';

export type IncomingFileKind = 'excel' | 'pdf' | 'label';

/** A file another app sent to Seznik (share or "Open with"), already copied into the app cache. */
export type IncomingFile = { kind: IncomingFileKind; name: string; uri: string; size?: number };

type IncomingFileState = {
  /** Waiting for the app to be ready (signed in) so it can be opened on the right screen. */
  pending: IncomingFile | null;
  setPending: (file: IncomingFile) => void;
  clearPending: () => void;
};

export const useIncomingFileStore = create<IncomingFileState>()((set) => ({
  pending: null,
  setPending: (file) => set({ pending: file }),
  clearPending: () => set({ pending: null }),
}));
