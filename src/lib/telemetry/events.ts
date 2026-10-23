import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { appHeaders, appPlatform } from '@/lib/telemetry/app-headers';

/**
 * Usage events for the admin desk (labels printed, printer connections).
 * Events are written to a small on-device queue first and sent in batches, so nothing is lost
 * offline or while signed out; every event carries its own id, so a retry never counts twice.
 */

const QUEUE_KEY = 'sez-print/event-queue';
const MAX_QUEUE = 5000; // a long offline stretch must not drop prints
const RETRY_MS = [15_000, 60_000, 5 * 60_000];
const BATCH = 50;
// The server counts a printer once per 10 minutes but still moves "last connected" forward, so only drop rapid repeats here.
const CONNECT_DEDUPE_MS = 60 * 1000;

export type PrintSource = 'manual_size' | 'template' | 'excel_bulk' | 'pdf' | 'photo' | 'scan' | 'serial' | 'other';
export type Transport = 'bt_spp' | 'ble' | 'wifi';
type QueuedEvent = Record<string, unknown> & { eventId: string; type: string; occurredAt: string };

let queue: QueuedEvent[] | null = null;
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastConnect: { key: string; at: number } | null = null;
let retryStep = 0;

/** Labels in queued `print` events the server has not confirmed yet. */
let pendingLabels = 0;
let pendingListener: ((labels: number) => void) | null = null;
let serverTotalListener: ((total: number) => void) | null = null;

/** The print stats store listens here, so the screen shows server total + pending without an import cycle. */
export function bindPrintTotals(onPending: (labels: number) => void, onServerTotal: (total: number) => void) {
  pendingListener = onPending;
  serverTotalListener = onServerTotal;
  onPending(pendingLabels);
}

/** Server-confirmed label count for the signed-in account (from sign-in, session refresh or a sync). */
export function reportServerTotal(total: number | null | undefined) {
  if (typeof total === 'number' && Number.isFinite(total)) serverTotalListener?.(total);
}

function recountPending(list: QueuedEvent[]) {
  pendingLabels = list.reduce((sum, e) => (e.type === 'print' ? sum + (Number(e.labels) || 0) : sum), 0);
  pendingListener?.(pendingLabels);
}

function uuid(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

function apiBase(): string {
  const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  return (process.env.EXPO_PUBLIC_API_URL || fromExtra || 'http://localhost:3000').replace(/\/$/, '');
}

async function load(): Promise<QueuedEvent[]> {
  if (queue) return queue;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue = raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    queue = [];
  }
  recountPending(queue);
  return queue;
}

async function save() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue ?? []));
  } catch {
    // Storage full or unavailable: the in-memory queue still works for this session.
  }
}

async function enqueue(event: Omit<QueuedEvent, 'eventId' | 'occurredAt'> & { type: string }) {
  const list = await load();
  list.push({ ...event, eventId: uuid(), occurredAt: new Date().toISOString() });
  if (list.length > MAX_QUEUE) list.splice(0, list.length - MAX_QUEUE);
  recountPending(list);
  await save();
  scheduleFlush();
}

function scheduleFlush(delayMs = 1500, replace = true) {
  if (flushTimer) {
    if (!replace) return;
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushEvents();
  }, delayMs);
}

function scheduleRetry() {
  const delay = RETRY_MS[Math.min(retryStep, RETRY_MS.length - 1)];
  retryStep += 1;
  scheduleFlush(delay, false); // never push back a sooner flush a new print already asked for
}

/** App came to the foreground (or the network is likely back): send now instead of waiting for the backoff. */
export function flushNow() {
  retryStep = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flushEvents();
}

/** Sends queued events. Stops quietly when signed out, offline or blocked; the queue is kept. */
export async function flushEvents(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const { useAuthStore } = await import('@/stores/auth-store');
    const token = useAuthStore.getState().token;
    const list = await load();
    if (!token) return;
    while (list.length > 0) {
      const batch = list.slice(0, BATCH);
      let res: Response;
      try {
        res = await fetch(`${apiBase()}/api/v1/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...appHeaders() },
          body: JSON.stringify({ sentAt: new Date().toISOString(), events: batch }),
        });
      } catch {
        scheduleRetry(); // offline: try again soon, and whenever the app comes back to the foreground
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { results?: { eventId: string; status: string; reason?: string }[]; printCountTotal?: number | null }
        | null;
      if (!data?.results) {
        // 400 for a missing printer, 401/403/429/5xx: nothing is dropped, try again later.
        scheduleRetry();
        return;
      }
      retryStep = 0;
      reportServerTotal(data.printCountTotal);
      const done = new Set(
        data.results
          .filter((r) => r.status !== 'rejected' || r.reason !== 'SERVER_ERROR')
          .map((r) => r.eventId),
      );
      for (const r of data.results) {
        if (r.status === 'rejected') console.warn('[events] server rejected', r.eventId, r.reason);
      }
      const before = list.length;
      // Filter in place: `list` is the live queue, and an event added during this send must survive.
      const kept = list.filter((e) => !done.has(e.eventId));
      list.length = 0;
      list.push(...kept);
      recountPending(list);
      await save();
      if (list.length === before) return; // nothing could be cleared, stop looping
    }
  } finally {
    flushing = false;
  }
}

export type PrintMeta = {
  widthMm: number;
  heightMm: number;
  source: PrintSource;
  printerName: string | null | undefined;
  sdkFamily?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  jobId?: string;
  /** Labels across the row; 1 for a normal label. */
  ups?: number;
};

/** One confirmed hand-off of `labels` labels to the printer. Called when the print button's job succeeds. */
export function trackPrint(labels: number, meta: PrintMeta) {
  const count = Math.max(1, Math.floor(labels) || 1);
  const printerName = meta.printerName?.trim();
  if (!printerName) return; // the desk counts nothing without a connected printer
  void enqueue({
    type: 'print',
    labels: count,
    jobs: 1,
    ups: Math.min(20, Math.max(1, Math.floor(meta.ups ?? 1) || 1)),
    source: meta.source,
    widthMm: Math.min(300, Math.max(5, Math.round(meta.widthMm * 10) / 10)),
    heightMm: Math.min(300, Math.max(5, Math.round(meta.heightMm * 10) / 10)),
    printerName,
    sdkFamily: familyFor(meta.sdkFamily),
    ...(meta.templateId ? { templateId: meta.templateId } : {}),
    ...(meta.templateName ? { templateName: meta.templateName } : {}),
    ...(meta.jobId ? { jobId: meta.jobId } : {}),
  });
}

/** A printer finished connecting. Repeats within a minute are ignored. */
export function trackPrinterConnected(printerName: string | null | undefined, transport: string | null | undefined, sdkId?: string | null) {
  const name = printerName?.trim();
  if (!name) return;
  const mapped: Transport = transport?.includes('ble') ? 'ble' : transport === 'wifi' ? 'wifi' : 'bt_spp';
  const now = Date.now();
  if (lastConnect && lastConnect.key === name && now - lastConnect.at < CONNECT_DEDUPE_MS) return;
  lastConnect = { key: name, at: now };
  void enqueue({ type: 'printer_connected', printerName: name, transport: mapped, sdkFamily: familyFor(sdkId) });
}

function familyFor(sdkId: string | null | undefined): string {
  switch (sdkId) {
    case 'td404': return 'td404';
    case 'josh': return 'josh';
    case 'tez': return 'tez';
    case 'labelx': return 'labelx';
    case 'dev': return 'dev';
    default: return 'unknown';
  }
}

/** Rating given in the in-app feedback prompt (1-5) with an optional note. */
export function trackFeedback(rating: number, message: string) {
  void enqueue({
    type: 'feedback',
    rating: Math.min(5, Math.max(1, Math.round(rating))),
    category: 'other',
    message: message.trim().slice(0, 1000),
    platform: appPlatform(),
  });
}

export type TemplateRequestShape = 'rectangle' | 'rounded' | 'circle' | 'other';

/** "Can't find my template": a label the user wants added to the catalogue. Size is optional. */
export function trackTemplateRequest(request: {
  description: string;
  widthMm?: number | null;
  heightMm?: number | null;
  shape?: TemplateRequestShape | null;
  searchText?: string;
}) {
  void enqueue({
    type: 'template_request',
    description: request.description.trim().slice(0, 500),
    ...(request.widthMm ? { widthMm: request.widthMm } : {}),
    ...(request.heightMm ? { heightMm: request.heightMm } : {}),
    ...(request.shape ? { shape: request.shape } : {}),
    ...(request.searchText?.trim() ? { searchText: request.searchText.trim().slice(0, 120) } : {}),
    platform: appPlatform(),
  });
}

/** The user pressed Buy on a shop product. */
export function trackProductClick(productKey: string, productName: string, category: 'labels' | 'printers') {
  void enqueue({ type: 'product_click', productKey, productName, category, source: 'shop_buy' });
}
