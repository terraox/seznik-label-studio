/**
 * Turns raw Bluetooth / socket errors into text a person can act on.
 * Returns null when the message is not a known connection error (caller keeps its own text).
 */
export function friendlyConnectionMessage(error: unknown): string | null {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : '';
  if (!raw) return null;

  if (/socket might be closed|read failed|broken pipe|connection reset|socket closed|ioexception/i.test(raw)) {
    return 'The printer disconnected while we were talking to it. Make sure it is switched on and close by, then reconnect and try again.';
  }
  if (/unable to connect|could not connect|connect(ion)? (failed|refused)|failed to connect|gatt.*(133|error)|status 133/i.test(raw)) {
    return 'Could not connect to the printer. Switch it off and on, keep it next to your phone, and make sure no other phone or app is connected to it.';
  }
  if (/timed? ?out|timeout/i.test(raw) && /bluetooth|printer|connect|socket|spp/i.test(raw)) {
    return 'The printer did not respond in time. Check that it is on and in range, then try again.';
  }
  return null;
}

/** Friendly text when the error is a known connection failure, otherwise the original message (or fallback). */
export function friendlyPrinterError(error: unknown, fallback: string): string {
  const friendly = friendlyConnectionMessage(error);
  if (friendly) return friendly;
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return raw || fallback;
}
