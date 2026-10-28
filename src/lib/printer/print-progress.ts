/**
 * Shared live print progress (Josh LPAPI push events + TD-404 paced status polls).
 * Pure helpers only; stores and native wiring live elsewhere.
 */

export type PrintProgressPhase = 'idle' | 'sending' | 'printing' | 'done' | 'failed';

export type PrintProgressState = {
  phase: PrintProgressPhase;
  copy: number | null;
  copies: number | null;
  /** Labels the printer has finished (Success events). */
  copiesDone: number;
  failure: string | null;
  /** Excel bulk jobs: the app's own send count. */
  bulkIndex: number | null;
  bulkTotal: number | null;
};

export const PRINT_PROGRESS_IDLE: PrintProgressState = {
  phase: 'idle',
  copy: null,
  copies: null,
  copiesDone: 0,
  failure: null,
  bulkIndex: null,
  bulkTotal: null,
};

/** @deprecated Use PRINT_PROGRESS_IDLE */
export const JOSH_PROGRESS_IDLE = PRINT_PROGRESS_IDLE;
/** @deprecated Use PrintProgressPhase */
export type JoshProgressPhase = PrintProgressPhase;
/** @deprecated Use PrintProgressState */
export type JoshProgressState = PrintProgressState;

/** The label being printed now (1-based), as the printer's events report it. */
export function printCurrentLabel(state: PrintProgressState): number {
  return Math.min(Math.max(1, state.copy ?? 1), state.copies ?? Math.max(1, state.copy ?? 1));
}

/** @deprecated Use printCurrentLabel */
export const joshCurrentLabel = printCurrentLabel;

/**
 * Progress bar fill, 0 to 1, or null when idle. Each label owns 1 / N of the bar (4 labels: 25%
 * each): the labels the printer has confirmed fill their share fully, and the one being printed
 * fills part of its own share (20% while sending, 60% once its data is sent). With an Excel bulk
 * it spans every label.
 */
export function printProgressFraction(state: PrintProgressState): number | null {
  if (state.phase === 'idle') return null;
  const copies = Math.max(1, state.copies ?? 1);
  const done = Math.min(copies, state.copiesDone ?? 0);
  let within: number;
  if (state.phase === 'done') within = 1;
  else if (state.copies == null) within = 0; // total not known yet: do not guess a share
  else {
    const stage = state.phase === 'printing' ? 0.6 : 0.2;
    // The label in flight (an event copy number beyond the confirmed ones) fills part of its share.
    const inFlight = done < copies && (state.copy ?? 0) > done ? stage : 0;
    within = Math.min(1, (done + inFlight) / copies);
  }
  if (state.bulkIndex != null && state.bulkTotal != null && state.bulkTotal > 0) {
    return Math.min(1, (Math.max(0, state.bulkIndex - 1) + within) / state.bulkTotal);
  }
  return within;
}

/** @deprecated Use printProgressFraction */
export const joshProgressFraction = printProgressFraction;

/** The SDK gives no percentage, so the text never shows one. */
export function printProgressText(state: PrintProgressState): string | null {
  const { phase, copies, failure, bulkIndex, bulkTotal } = state;
  if (phase === 'idle') return null;
  const bulk = bulkIndex != null && bulkTotal != null ? `Label ${bulkIndex} of ${bulkTotal}: ` : '';
  switch (phase) {
    case 'sending':
      return `${bulk}Sending`;
    case 'printing':
      return copies != null && copies > 1 && state.copy != null
        ? `${bulk}Printing ${Math.min(state.copy, copies)} of ${copies}`
        : `${bulk}Printing`;
    case 'done':
      return `${bulk}Done`;
    case 'failed':
      return `${bulk}Failed: ${failure ?? 'printer reported a problem'}`;
  }
}

/** @deprecated Use printProgressText */
export const joshProgressText = printProgressText;

export type PrintProgressEvent = {
  progress?: string;
  copy?: number | null;
  copies?: number | null;
  reason?: string;
  reasonCode?: number | null;
  /** When set, used as the failure line instead of mapping reason codes. */
  failureMessage?: string | null;
};

/**
 * Map a FAILED reason to a user line. Josh LPAPI names and TD-404 status codes share this table;
 * unknown strings that already look like sentences are shown as-is.
 */
export function progressFailMessage(
  reason: unknown,
  reasonCode?: number | null,
  failureMessage?: string | null,
): string {
  if (typeof failureMessage === 'string' && failureMessage.trim()) return failureMessage.trim();
  if (typeof reason === 'string' && reason.includes(' ') && reason.length > 3) return reason;
  // Lazy import cycle avoidance: Josh message map lives in josh-status.
  // Callers that need Josh enum mapping pass through applyPrintProgressEvent which
  // resolves via the optional mapper below.
  const code =
    reasonCode != null && Number.isFinite(reasonCode)
      ? ` (code ${reasonCode})`
      : typeof reason === 'string' && reason.length > 0
        ? ` (${reason})`
        : '';
  return `Printer reported a problem${code}`;
}

let failMessageMapper: ((reason: unknown, reasonCode?: number | null) => string) | null = null;

/** Register Josh (or other) enum→message mapping once at app load. */
export function setProgressFailMessageMapper(
  mapper: (reason: unknown, reasonCode?: number | null) => string,
): void {
  failMessageMapper = mapper;
}

/** Apply one native print-progress event. Unknown events leave the state unchanged. */
export function applyPrintProgressEvent(
  state: PrintProgressState,
  event: PrintProgressEvent,
): PrintProgressState {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const copies = num(event.copies) ?? state.copies;
  const copy = num(event.copy) ?? state.copy;
  switch (event.progress) {
    case 'CONNECTED':
      return { ...state, phase: 'sending', copy, copies };
    case 'START_COPY':
      return { ...state, phase: 'sending', copy, copies };
    case 'DATA_ENDED':
      return { ...state, phase: 'printing', copy, copies };
    case 'SUCCESS':
      // The native "submit accepted" success carries no label count; only a counted one is real.
      if (event.copy == null || event.copy < 1) return state;
      return copies != null && copy != null && copy < copies
        ? { ...state, phase: 'printing', copy, copies, copiesDone: Math.max(state.copiesDone ?? 0, copy) }
        : { ...state, phase: 'done', copy, copies, copiesDone: copies ?? copy ?? state.copiesDone, failure: null };
    case 'FAILED': {
      const mapped = failMessageMapper
        ? failMessageMapper(event.reason, event.reasonCode)
        : progressFailMessage(event.reason, event.reasonCode, event.failureMessage);
      const failure =
        event.failureMessage?.trim() ||
        (typeof event.reason === 'string' && event.reason.includes(' ')
          ? event.reason
          : mapped);
      return {
        ...state,
        phase: 'failed',
        copy,
        copies,
        failure,
      };
    }
    default:
      return state;
  }
}

/** @deprecated Use applyPrintProgressEvent */
export const applyJoshProgressEvent = applyPrintProgressEvent;
