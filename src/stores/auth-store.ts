import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ConsumerPrinterId } from '@/constants/printer-models';
import { isConsumerPrinterId } from '@/constants/printer-models';
import {
  fetchMe,
  loginUser,
  registerUser,
  setPurchasedPrinter,
  type AuthUserDto,
} from '@/lib/auth/api';
import { flushEvents, reportServerTotal } from '@/lib/telemetry/events';
import { usePrinterStore } from '@/stores/printer-store';

function applyPurchasedPrinter(printerId: string | null | undefined, chosen = false, serverTotal?: number) {
  reportServerTotal(serverTotal);
  // Every sign-in / session refresh also sends any usage events waiting on the phone.
  void flushEvents();
  if (!isConsumerPrinterId(printerId)) return;
  const printer = usePrinterStore.getState();
  // Choosing a printer here starts over; otherwise the printer last connected wins.
  if (chosen) printer.setPreferredPrinterModel(null);
  printer.setSelectedPrinterModel(chosen ? printerId : (printer.preferredPrinterModel ?? printerId));
}

type AuthStoreState = {
  token: string | null;
  user: AuthUserDto | null;
  needsPrinter: boolean;
  hydrated: boolean;
  register: (input: {
    name: string;
    phone: string;
    password: string;
    otpProof: string;
  }) => Promise<{ ok: true; needsPrinter: boolean } | { ok: false; error: string }>;
  login: (
    phone: string,
    credential: { password: string } | { otpProof: string },
  ) => Promise<{ ok: true; needsPrinter: boolean } | { ok: false; error: string }>;
  setPrinter: (
    printerId: ConsumerPrinterId,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  refreshSession: () => Promise<void>;
  logout: () => void;
  bypassAuth: () => void;
};

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      needsPrinter: false,
      hydrated: false,

      register: async ({ name, phone, password, otpProof }) => {
        try {
          const result = await registerUser({ name, mobile: phone, password, otpProof });
          set({
            token: result.token,
            user: result.user,
            needsPrinter: result.needsPrinter,
          });
          applyPurchasedPrinter(result.user.printerId, false, result.user.printCountTotal);
          return { ok: true, needsPrinter: result.needsPrinter };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Registration failed.',
          };
        }
      },

      login: async (phone, credential) => {
        try {
          const result = await loginUser({ mobile: phone, ...credential });
          set({
            token: result.token,
            user: result.user,
            needsPrinter: result.needsPrinter,
          });
          applyPurchasedPrinter(result.user.printerId, false, result.user.printCountTotal);
          return { ok: true, needsPrinter: result.needsPrinter };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Login failed.',
          };
        }
      },

      setPrinter: async (printerId) => {
        const token = get().token;
        if (!token) return { ok: false, error: 'Please log in again.' };
        try {
          const result = await setPurchasedPrinter(token, printerId);
          set({ user: result.user, needsPrinter: false });
          applyPurchasedPrinter(printerId, true);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Could not save printer.',
          };
        }
      },

      refreshSession: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const result = await fetchMe(token);
          set({ user: result.user, needsPrinter: result.needsPrinter });
          applyPurchasedPrinter(result.user.printerId, false, result.user.printCountTotal);
        } catch {
          set({ token: null, user: null, needsPrinter: false });
        }
      },

      logout: () => set({ token: null, user: null, needsPrinter: false }),

      bypassAuth: () => {
        const devUser: AuthUserDto = {
          id: 'dev-bypass',
          name: 'Developer',
          mobile: '9999999999',
          printerId: 'tejas',
          printerName: 'SEZNIK Tejas',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };
        set({
          token: 'dev-bypass-token',
          user: devUser,
          needsPrinter: false,
        });
        applyPurchasedPrinter('tejas');
      },
    }),
    {
      name: 'sez-print/auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        needsPrinter: state.needsPrinter,
      }),
      onRehydrateStorage: () => (state) => {
        useAuthStore.setState({ hydrated: true });
        if (state?.user?.printerId) {
          applyPurchasedPrinter(state.user.printerId);
        }
      },
    },
  ),
);
