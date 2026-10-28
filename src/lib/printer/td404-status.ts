/**
 * TD-404 / TSC `ESC ! ?` (`1B 21 3F`) status-byte parser.
 * Bit layout matches common TSC firmware; hardware may omit a reply — callers
 * must treat empty as "unknown" and fall back to a timed idle wait.
 */

/** Query bytes: ESC ! ? */
export const TD404_STATUS_QUERY = new Uint8Array([0x1b, 0x21, 0x3f]);

export type Td404PrinterStatus = {
  raw: number | null;
  /** True when the printing bit is set. Null when no reply. */
  printing: boolean | null;
  paperOut: boolean;
  coverOpen: boolean;
  paused: boolean;
  jammed: boolean;
  error: boolean;
  /** Human line for FAILED progress events. Null when OK / unknown. */
  failureMessage: string | null;
};

/**
 * Per-label feed estimate (matches native). TSC `SPEED n` is inches/sec;
 * travel = label height + gap.
 */
export function td404EstimateFeedMs(heightMm: number, speed: number, gapMm = 3): number {
  const ips = Math.min(12, Math.max(1, speed));
  const mmPerSec = ips * 25.4;
  const travelMm = Math.max(5, heightMm) + Math.max(0, gapMm);
  const ms = (travelMm / mmPerSec) * 1000 + 60;
  return Math.min(15_000, Math.max(180, Math.round(ms)));
}

/** Idle timeout from label geometry and print speed (mm/s). Floor 3s, ceiling 90s. */
export function td404IdleTimeoutMs(heightMm: number, speed: number, copies = 1, gapMm = 3): number {
  const total = td404EstimateFeedMs(heightMm, speed, gapMm) * Math.max(1, copies);
  return Math.min(90_000, Math.max(3_000, Math.round(total)));
}

/**
 * Parse the first status byte from a raw SPP reply.
 * Bits (TSC common): 0 head, 1 jam, 2 paper, 3 ribbon, 4 pause, 5 printing, 6 cover.
 */
export function parseTd404StatusReply(bytes: Uint8Array | number[] | null | undefined): Td404PrinterStatus {
  if (!bytes || bytes.length === 0) {
    return {
      raw: null,
      printing: null,
      paperOut: false,
      coverOpen: false,
      paused: false,
      jammed: false,
      error: false,
      failureMessage: null,
    };
  }
  const raw = bytes[0] & 0xff;
  const headOpen = (raw & 0x01) !== 0;
  const jammed = (raw & 0x02) !== 0;
  const paperOut = (raw & 0x04) !== 0;
  const paused = (raw & 0x10) !== 0;
  const printing = (raw & 0x20) !== 0;
  const coverOpen = (raw & 0x40) !== 0 || headOpen;
  const error = paperOut || coverOpen || jammed;
  let failureMessage: string | null = null;
  if (coverOpen || headOpen) failureMessage = 'Printer lid is open. Close it and try again.';
  else if (paperOut) failureMessage = 'No paper detected. Load paper and try again.';
  else if (jammed) failureMessage = 'Paper jam. Clear the path and try again.';
  else if (paused) failureMessage = 'Printer is paused. Press feed/pause and try again.';
  return {
    raw,
    printing,
    paperOut,
    coverOpen,
    paused,
    jammed,
    error,
    failureMessage,
  };
}
