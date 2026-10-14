import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AuthAccount = { name: string; phone: string; password: string };

type AuthStoreState = {
  /** Accounts live on this device only until a backend exists. */
  accounts: Record<string, AuthAccount>;
  /** Phone number of the signed-in account. */
  sessionPhone: string | null;
  hydrated: boolean;
  register: (account: AuthAccount) => { ok: true } | { ok: false; error: string };
  login: (phone: string, password: string) => { ok: true } | { ok: false; error: string };
  logout: () => void;
};

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      accounts: {},
      sessionPhone: null,
      hydrated: false,

      register: (account) => {
        if (get().accounts[account.phone]) {
          return { ok: false, error: 'This number is already registered. Please log in.' };
        }
        set((state) => ({
          accounts: { ...state.accounts, [account.phone]: account },
          sessionPhone: account.phone,
        }));
        return { ok: true };
      },

      login: (phone, password) => {
        const account = get().accounts[phone];
        if (!account || account.password !== password) {
          return { ok: false, error: 'Incorrect phone number or password.' };
        }
        set({ sessionPhone: phone });
        return { ok: true };
      },

      logout: () => set({ sessionPhone: null }),
    }),
    {
      name: 'sez-print/auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ accounts: state.accounts, sessionPhone: state.sessionPhone }),
      onRehydrateStorage: () => () => useAuthStore.setState({ hydrated: true }),
    },
  ),
);
