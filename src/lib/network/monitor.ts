import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useNetworkStore } from '@/stores/network-store';

/** Android's own connectivity check address: tiny, fast, answers 204 with no body. */
const PROBE_URL = 'https://connectivitycheck.gstatic.com/generate_204';
const PROBE_TIMEOUT_MS = 4000;
const ONLINE_EVERY_MS = 20000;
const OFFLINE_EVERY_MS = 4000;
/** Failed checks in a row before the app calls itself offline, so one slow reply does not flash the banner. */
const FAILS_TO_GO_OFFLINE = 2;

let fails = 0;
let running: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(PROBE_URL, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    return true; // any reply, even an error status, means the internet is reachable
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Check now. `manual` (the Retry button) reports offline on the first failure. */
export function checkConnection(manual = false): Promise<boolean> {
  if (running) return running;
  const store = useNetworkStore.getState();
  if (manual) store.setChecking(true);
  running = (async () => {
    const ok = await probe();
    fails = ok ? 0 : fails + 1;
    if (ok) useNetworkStore.getState().setOnline(true);
    else if (manual || fails >= FAILS_TO_GO_OFFLINE) useNetworkStore.getState().setOnline(false);
    return ok;
  })().finally(() => {
    running = null;
    useNetworkStore.getState().setChecking(false);
  });
  return running;
}

/** Keeps `useNetworkStore` current: on start, every few seconds, and when the app returns to the foreground. */
export function useNetworkMonitor(): void {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (stopped) return;
      if (AppState.currentState === 'active') await checkConnection();
      if (stopped) return;
      const wait = useNetworkStore.getState().online ? ONLINE_EVERY_MS : OFFLINE_EVERY_MS;
      timer = setTimeout(loop, wait);
    };
    void loop();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (timer) clearTimeout(timer);
      void loop();
    });
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);
}
