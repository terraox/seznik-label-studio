/**
 * Pure helpers for a serial print job: batch expansion, the resume cursor and the design hash.
 * No React Native, no stores; the stores in src/stores only persist what these return.
 */

import type { LabelDocument } from '@/lib/label-document';
import { MAX_SERIAL_BATCH } from './types';

export interface SerialPrintItem {
  /** 0-based position in the batch (0..count-1). */
  labelIndex: number;
  /** Index handed to the engine: labelIndex + the continue offset the job started with. */
  serialIndex: number;
  /** Copies sent for this item. Uncollated: the copies setting. Collated: always 1. */
  copies: number;
  /** 1-based copy number (collated sends one copy per round). */
  copyNumber: number;
  round: number;
}

/**
 * Items in physical order. `startAt` skips labels already printed (resume).
 * Copies print C times per label; collated prints the whole batch once per round.
 * Independent of the Excel per-row copies feature.
 */
export function expandSerialBatch(opts: {
  count: number;
  offset?: number;
  copies?: number;
  collate?: boolean;
  startAt?: number;
}): SerialPrintItem[] {
  const count = Math.max(0, Math.min(MAX_SERIAL_BATCH, Math.floor(opts.count)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const copies = Math.max(1, Math.floor(opts.copies ?? 1));
  const startAt = Math.max(0, Math.floor(opts.startAt ?? 0));
  const items: SerialPrintItem[] = [];
  if (!opts.collate || copies === 1) {
    for (let i = startAt; i < count; i += 1) {
      items.push({ labelIndex: i, serialIndex: offset + i, copies, copyNumber: 1, round: 1 });
    }
    return items;
  }
  for (let round = 1; round <= copies; round += 1) {
    for (let i = startAt; i < count; i += 1) {
      items.push({ labelIndex: i, serialIndex: offset + i, copies: 1, copyNumber: round, round });
    }
  }
  return items;
}

/** Total physical labels a batch produces. */
export function serialPhysicalTotal(count: number, copies: number): number {
  return Math.max(0, Math.floor(count)) * Math.max(1, Math.floor(copies));
}

export type SerialJobStatus = 'running' | 'failed' | 'cancelled' | 'done';

export interface SerialJobCursor {
  jobId: string;
  labelId: string;
  designHash: string;
  /** Labels in the batch. */
  total: number;
  /** Continue offset the job started with, so a resume re-uses the same indexes. */
  baseOffset: number;
  /** First label (0-based) that is not yet confirmed printed. */
  nextIndex: number;
  /** Label whose send failed or was cancelled mid-way; it may be half printed. */
  failedIndex?: number;
  status: SerialJobStatus;
  startedAt: number;
  updatedAt: number;
}

export function newCursor(p: { jobId: string; labelId: string; designHash: string; total: number; baseOffset: number; startAt?: number; now?: number }): SerialJobCursor {
  const now = p.now ?? Date.now();
  return {
    jobId: p.jobId,
    labelId: p.labelId,
    designHash: p.designHash,
    total: p.total,
    baseOffset: p.baseOffset,
    nextIndex: p.startAt ?? 0,
    status: 'running',
    startedAt: now,
    updatedAt: now,
  };
}

/** Written after EVERY confirmed label. */
export function confirmLabel(c: SerialJobCursor, labelIndex: number, now = Date.now()): SerialJobCursor {
  const nextIndex = Math.max(c.nextIndex, labelIndex + 1);
  return { ...c, nextIndex, failedIndex: undefined, status: nextIndex >= c.total ? 'done' : 'running', updatedAt: now };
}

export function markFailed(c: SerialJobCursor, labelIndex: number, now = Date.now()): SerialJobCursor {
  return { ...c, failedIndex: labelIndex, status: 'failed', updatedAt: now };
}

export function markCancelled(c: SerialJobCursor, now = Date.now()): SerialJobCursor {
  return { ...c, status: c.status === 'done' ? 'done' : 'cancelled', updatedAt: now };
}

export interface ResumeInfo {
  /** Label to reprint (possibly half printed). */
  resumeAt: number;
  /** Label after it, for "skip". */
  skipTo: number;
  total: number;
  baseOffset: number;
  designChanged: boolean;
}

/** What to offer after an interrupted job. Null when there is nothing to resume. */
export function resumeInfo(c: SerialJobCursor | undefined, currentHash: string): ResumeInfo | null {
  if (!c || c.status === 'done' || c.nextIndex >= c.total) return null;
  const resumeAt = c.failedIndex ?? c.nextIndex;
  return {
    resumeAt,
    skipTo: Math.min(c.total, resumeAt + 1),
    total: c.total,
    baseOffset: c.baseOffset,
    designChanged: c.designHash !== currentHash,
  };
}

/** Labels fully confirmed so far (what continue-from-last may advance by). */
export function confirmedCount(c: SerialJobCursor): number {
  return Math.min(c.total, c.nextIndex);
}

/** FNV-1a hash of the parts of a design that decide what prints (ids and timestamps excluded). */
export function designHash(doc: Pick<LabelDocument, 'elements' | 'widthMm' | 'heightMm' | 'serialBatch'>): string {
  const text = JSON.stringify({ w: doc.widthMm, h: doc.heightMm, b: doc.serialBatch, e: doc.elements });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function newJobId(): string {
  return `sj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** The `[serial-print]` line every sent / confirmed / failed item logs. */
export function serialPrintLogLine(p: {
  jobId: string;
  label: number;
  total: number;
  serialIndex: number;
  value: string;
  copy: number;
  copies: number;
  state: 'sent' | 'confirmed' | 'failed';
}): string {
  return `[serial-print] job=${p.jobId} label=${p.label}/${p.total} serialIndex=${p.serialIndex} value="${p.value}" copy=${p.copy}/${p.copies} state=${p.state}`;
}
