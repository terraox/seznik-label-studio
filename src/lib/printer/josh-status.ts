/**
 * Josh (DothanTech LPAPI) print failure messages, progress text and the status log.
 * Pure functions only; the native events are wired in printer-manager.ts.
 * Live progress types/helpers live in print-progress.ts (shared with TD-404).
 */

import {
  applyPrintProgressEvent,
  setProgressFailMessageMapper,
  type PrintProgressEvent,
  type PrintProgressState,
} from '@/lib/printer/print-progress';

export {
  PRINT_PROGRESS_IDLE,
  JOSH_PROGRESS_IDLE,
  printCurrentLabel,
  joshCurrentLabel,
  printProgressFraction,
  joshProgressFraction,
  printProgressText,
  joshProgressText,
  applyPrintProgressEvent,
  applyJoshProgressEvent,
  type PrintProgressPhase,
  type PrintProgressState,
  type PrintProgressEvent,
  type JoshProgressPhase,
  type JoshProgressState,
} from '@/lib/printer/print-progress';

/** Every IDzPrinter.PrintFailReason in the LPAPI jar (read with javap, LPAPI-2026-01-08-R). */
export const JOSH_FAIL_REASONS = [
  'OK',
  'IsPrinting',
  'IsRotating',
  'Cancelled',
  'EnvNotReady',
  'VolTooLow',
  'VolTooHigh',
  'TphNotFound',
  'TphTooHot',
  'CoverOpened',
  'No_Paper',
  'TphOpened',
  'No_Ribbon',
  'Unmatched_Ribbon',
  'TphTooCold',
  'Usedup_Ribbon',
  'Usedup_Ribbon2',
  'No_Label',
  'Unmatched_Label',
  'Usedup_Label',
  'No_Ribbon2',
  'Unmatched_Ribbon2',
  'LabelCanOpend',
  'Disconnected',
  'Timeout',
  'Other',
] as const;

export type JoshFailReason = (typeof JOSH_FAIL_REASONS)[number];

export const JOSH_LID_MESSAGE = 'Printer lid is open. Close it and try again.';
export const JOSH_PAPER_MESSAGE = 'No paper detected. Load paper and try again.';
const RIBBON_MESSAGE = 'Ribbon problem. Check the ribbon and try again.';
const RECONNECT_MESSAGE = 'Printer connection lost. Reconnect the printer and try again.';

export const JOSH_FAIL_MESSAGES: Record<JoshFailReason, string> = {
  OK: 'Print finished.',
  IsPrinting: 'Printer is busy. Wait for the current print to finish.',
  IsRotating: 'Printer is busy. Wait a moment and try again.',
  Cancelled: 'Print was cancelled.',
  EnvNotReady: 'Printer is not ready. Check it is on and try again.',
  VolTooLow: 'Battery too low. Charge the printer.',
  VolTooHigh: 'Printer voltage is too high. Unplug the charger and try again.',
  TphNotFound: 'Print head not found. Switch the printer off and on, then try again.',
  TphTooHot: 'Printer is too hot. Let it cool down.',
  TphTooCold: 'Printer is too cold. Move it somewhere warmer.',
  CoverOpened: JOSH_LID_MESSAGE,
  TphOpened: JOSH_LID_MESSAGE,
  LabelCanOpend: JOSH_LID_MESSAGE,
  No_Paper: JOSH_PAPER_MESSAGE,
  No_Label: JOSH_PAPER_MESSAGE,
  Usedup_Label: JOSH_PAPER_MESSAGE,
  No_Ribbon: RIBBON_MESSAGE,
  No_Ribbon2: RIBBON_MESSAGE,
  Unmatched_Ribbon: RIBBON_MESSAGE,
  Unmatched_Ribbon2: RIBBON_MESSAGE,
  Usedup_Ribbon: RIBBON_MESSAGE,
  Usedup_Ribbon2: RIBBON_MESSAGE,
  Unmatched_Label: 'Label paper does not match the printer. Load the right paper and try again.',
  Disconnected: RECONNECT_MESSAGE,
  Timeout: 'Printer did not respond. Check it is on, then reconnect and try again.',
  Other: 'Printer reported a problem.',
};

export function isJoshFailReason(value: unknown): value is JoshFailReason {
  return typeof value === 'string' && (JOSH_FAIL_REASONS as readonly string[]).includes(value);
}

/** One plain line for a failure reason. `Other` and unknown names carry the raw code. Never throws. */
export function joshFailMessage(reason: unknown, reasonCode?: number | null): string {
  if (isJoshFailReason(reason) && reason !== 'Other') return JOSH_FAIL_MESSAGES[reason];
  const code =
    reasonCode != null && Number.isFinite(reasonCode)
      ? ` (code ${reasonCode})`
      : typeof reason === 'string' && reason.length > 0 && reason !== 'Other'
        ? ` (${reason})`
        : '';
  return `${JOSH_FAIL_MESSAGES.Other}${code}`;
}

// Shared progress FAILED events resolve Josh enum names through this mapper.
setProgressFailMessageMapper(joshFailMessage);

/** Apply a progress event; FAILED reasons use Josh message map when applicable. */
export function applyJoshProgressEventWithFailMap(
  state: PrintProgressState,
  event: PrintProgressEvent,
): PrintProgressState {
  return applyPrintProgressEvent(state, event);
}

/**
 * Pull the failure reason out of a native rejection. Native sets
 * "JOSH_PRINT_FAILED: <PrintFailReason>" and "JOSH_PRINT_TIMEOUT".
 * Returns null when the error is not a printer-reported failure.
 */
export function parseJoshFailure(error: unknown): { reason: string } | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/JOSH_PRINT_TIMEOUT/.test(message)) return { reason: 'Timeout' };
  const match = /JOSH_PRINT_FAILED:\s*([A-Za-z_0-9]+)/.exec(message);
  if (!match) return null;
  return { reason: match[1] };
}

/** Error to throw to the print screen: the plain message when the reason is known, else the original. */
export function joshPrintError(error: unknown): unknown {
  const parsed = parseJoshFailure(error);
  if (!parsed || !isJoshFailReason(parsed.reason)) return error;
  const friendly = new Error(joshFailMessage(parsed.reason));
  (friendly as Error & { code?: string }).code = `JOSH_${parsed.reason}`;
  return friendly;
}

/**
 * True while the charger is plugged in. SDK: isConnectedAdapter is the adapter flag and
 * chargeStatus is the printer's charge byte (falls back to the adapter flag on older firmware).
 * From reading the SDK, not confirmed on a device.
 */
export function joshCharging(status: { chargeStatus?: number; isConnectedAdapter?: boolean } | null | undefined): boolean {
  if (!status) return false;
  return status.isConnectedAdapter === true || (status.chargeStatus ?? 0) > 0;
}

export type JoshPrinterStatus = {
  available: boolean;
  busy?: boolean;
  refreshAccepted?: boolean;
  changedAfterRefresh?: boolean;
  waitedMs?: number;
  printerHeadTem?: number;
  batteryVoltage?: number;
  batteryCount?: number;
  batteryVoltageCount?: string | null;
  chargeStatus?: number;
  isConnectedAdapter?: boolean;
  printerStatus?: number;
  printPages?: number;
  printLines?: number;
  workLines?: number;
  nullLines?: number;
  gapType?: number;
  supportedGapTypes?: number[];
};

/** A reading the printer did not report: missing, not finite, or zero. */
export function reportedNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? value : null;
}

export function joshReadingText(value: unknown, decimals?: number): string {
  const n = reportedNumber(value);
  if (n == null) return 'not reported';
  return decimals == null ? `${n}` : n.toFixed(decimals);
}

export function toBinary(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return (value >>> 0).toString(2).padStart(16, '0');
}

/** Text for the "Copy status log" button. Every field is listed, reported or not. */
export function formatJoshStatusLog(status: JoshPrinterStatus | null, now: Date = new Date()): string {
  const line = (key: string, value: unknown) =>
    `${key}: ${value === undefined || value === null ? 'n/a' : Array.isArray(value) ? value.join(',') : String(value)}`;
  if (!status || !status.available) {
    return [`time: ${now.toISOString()}`, 'status: unavailable (not connected, busy printing, or refresh not run)'].join('\n');
  }
  return [
    line('time', now.toISOString()),
    line('refreshAccepted', status.refreshAccepted),
    line('changedAfterRefresh', status.changedAfterRefresh),
    line('waitedMs', status.waitedMs),
    line('printerHeadTem', status.printerHeadTem),
    line('batteryVoltage', status.batteryVoltage),
    line('batteryCount', status.batteryCount),
    line('batteryVoltageCount', status.batteryVoltageCount),
    line('chargeStatus', status.chargeStatus),
    line('isConnectedAdapter', status.isConnectedAdapter),
    line('printerStatus', status.printerStatus),
    line('printerStatus(binary)', toBinary(status.printerStatus)),
    line('printPages', status.printPages),
    line('printLines', status.printLines),
    line('workLines', status.workLines),
    line('nullLines', status.nullLines),
    line('gapType', status.gapType),
    line('supportedGapTypes', status.supportedGapTypes),
  ].join('\n');
}

/**
 * PrinterParam.printerStatus is a status CODE, not a bitfield. The LPAPI jar maps it to a PrintFailReason
 * (DzPrinter.a(byte), read from the disassembly). 11 or below is OK. 34 = lid open was seen on the DP27
 * (original app showed "Paper hatch cover is not closed"); 33 = too hot was also seen and the original app
 * showed "temperature is too high". The other rows are from reading source only.
 */
export const JOSH_STATUS_CODES: Record<number, JoshFailReason> = {
  12: 'Cancelled',
  20: 'EnvNotReady',
  30: 'VolTooLow',
  31: 'VolTooHigh',
  32: 'TphNotFound',
  33: 'TphTooHot',
  34: 'CoverOpened',
  35: 'No_Paper',
  36: 'TphOpened',
  37: 'No_Ribbon',
  38: 'Unmatched_Ribbon',
  39: 'TphTooCold',
  40: 'Usedup_Ribbon',
  41: 'Usedup_Ribbon2',
  42: 'No_Label',
  43: 'Unmatched_Label',
  44: 'Usedup_Label',
  45: 'No_Ribbon2',
  46: 'Unmatched_Ribbon2',
  50: 'LabelCanOpend',
};

/** The reason a status code stands for, or null for OK, missing and unknown codes. Never throws. */
export function joshStatusReason(code: unknown): JoshFailReason | null {
  if (typeof code !== 'number' || !Number.isFinite(code)) return null;
  return JOSH_STATUS_CODES[code] ?? null;
}

/** Live warning for a status code. Only conditions the user can fix; unknown codes warn nothing. */
export function joshStatusAlert(code: unknown): string | null {
  const reason = joshStatusReason(code);
  if (!reason || reason === 'Cancelled' || reason === 'EnvNotReady') return null;
  return JOSH_FAIL_MESSAGES[reason];
}

/** true when the code is a lid-open reason, false when it is anything else, null when missing. */
export function joshLidOpen(code: unknown): boolean | null {
  if (typeof code !== 'number' || !Number.isFinite(code)) return null;
  const reason = joshStatusReason(code);
  return reason === 'CoverOpened' || reason === 'TphOpened' || reason === 'LabelCanOpend';
}

/** "Printer says" line: lid, paper, or another fault in short words. */
export function joshPrinterSays(code: unknown): string {
  if (typeof code !== 'number' || !Number.isFinite(code)) return 'n/a';
  const reason = joshStatusReason(code);
  if (reason == null) return 'Paper detected';
  if (joshLidOpen(code)) return 'Lid opened';
  if (reason === 'No_Paper' || reason === 'No_Label') return 'No paper';
  return reason.replace(/_/g, ' ');
}

/** Bits that differ between two printerStatus readings, as a binary mask string. */
export function changedStatusBits(prev: unknown, next: unknown): string {
  if (typeof prev !== 'number' || typeof next !== 'number') return toBinary(0);
  return toBinary((prev ^ next) >>> 0);
}
