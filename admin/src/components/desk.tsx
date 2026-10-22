'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Admin } from '@/lib/types';

const DeskContext = createContext<Admin | null>(null);
const ToastContext = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});

export function useDesk() {
  const admin = useContext(DeskContext);
  if (!admin) throw new Error('Desk is not ready');
  return admin;
}

export function useToast() {
  return useContext(ToastContext);
}

export function DeskProviders({
  admin,
  children,
}: {
  admin: Admin;
  children: React.ReactNode;
}) {
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  const notify = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  return (
    <DeskContext.Provider value={admin}>
      <ToastContext.Provider value={notify}>
        {children}
        {toast ? (
          <div className={toast.tone === 'bad' ? 'toast bad' : 'toast'} role="status">
            {toast.text}
          </div>
        ) : null}
      </ToastContext.Provider>
    </DeskContext.Provider>
  );
}

const HIDE_KEY = 'sez-admin-hide-internal';
const HideInternalContext = createContext<[boolean, (value: boolean) => void]>([false, () => {}]);

/** One switch for the whole panel: leave test / internal accounts out of every page's numbers. Off by default. */
export function HideInternalProvider({ children }: { children: React.ReactNode }) {
  const [hide, setHideState] = useState(false);
  useEffect(() => {
    try { setHideState(localStorage.getItem(HIDE_KEY) === '1'); } catch { /* storage blocked: keep default */ }
  }, []);
  const setHide = useCallback((value: boolean) => {
    setHideState(value);
    try { localStorage.setItem(HIDE_KEY, value ? '1' : '0'); } catch { /* ignore */ }
  }, []);
  return <HideInternalContext.Provider value={[hide, setHide]}>{children}</HideInternalContext.Provider>;
}

export function useHideInternal() {
  return useContext(HideInternalContext);
}
