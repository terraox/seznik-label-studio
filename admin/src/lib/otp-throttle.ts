/** In-memory limits per mobile. Resets on server restart and is not shared across instances. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;

type Entry = { sends: number[]; lastSendAt: number };
// Kept on globalThis so every route bundle shares one set of limits.
const g = globalThis as unknown as { __otpThrottle?: Map<string, Entry> };
const entries = (g.__otpThrottle ??= new Map<string, Entry>());

function entry(mobile: string): Entry {
  let e = entries.get(mobile);
  if (!e) {
    e = { sends: [], lastSendAt: 0 };
    entries.set(mobile, e);
  }
  return e;
}

/** Returns seconds to wait, or 0 when a send is allowed. */
export function sendWaitSeconds(mobile: string): { wait: number; capped: boolean } {
  const e = entry(mobile);
  const now = Date.now();
  e.sends = e.sends.filter((t) => now - t < SEND_WINDOW_MS);
  if (e.sends.length >= MAX_SENDS_PER_WINDOW) {
    return { wait: Math.ceil((SEND_WINDOW_MS - (now - e.sends[0])) / 1000), capped: true };
  }
  const left = RESEND_COOLDOWN_MS - (now - e.lastSendAt);
  return { wait: left > 0 ? Math.ceil(left / 1000) : 0, capped: false };
}

export function recordSend(mobile: string) {
  const e = entry(mobile);
  const now = Date.now();
  e.sends.push(now);
  e.lastSendAt = now;
}
