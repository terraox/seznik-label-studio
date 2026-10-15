import { create } from 'zustand';

export type IncomingSpreadsheet = { name: string; uri: string; size?: number };

type IncomingFileState = {
  /** A spreadsheet another app sent to Sez Print, waiting for the Data File screen to import it. */
  pending: IncomingSpreadsheet | null;
  setPending: (file: IncomingSpreadsheet) => void;
  clearPending: () => void;
};

export const useIncomingFileStore = create<IncomingFileState>()((set) => ({
  pending: null,
  setPending: (file) => set({ pending: file }),
  clearPending: () => set({ pending: null }),
}));
