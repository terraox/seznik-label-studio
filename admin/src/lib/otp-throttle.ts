import { hit } from './rate-limit';

/** Limits per mobile, stored in Postgres so they survive restarts and are shared across servers. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;

/** Counts a send attempt. `wait` is seconds to wait (0 = allowed). */
export async function takeSendSlot(mobile: string): Promise<{ wait: number; capped: boolean }> {
  const cooldown = await hit(`otp-cooldown:${mobile}`, 1, RESEND_COOLDOWN_MS);
  if (!cooldown.allowed) return { wait: cooldown.retryAfter, capped: false };
  const hour = await hit(`otp-hour:${mobile}`, MAX_SENDS_PER_WINDOW, SEND_WINDOW_MS);
  if (!hour.allowed) return { wait: hour.retryAfter, capped: true };
  return { wait: 0, capped: false };
}
