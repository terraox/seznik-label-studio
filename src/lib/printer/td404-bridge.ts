/**
 * TD-404 bridge switch. Tejas and Rudra each have their own native module
 * (`td404-tejas-printer`, `td404-rudra-printer`). Every app caller goes through
 * here; the selected consumer printer decides which module answers.
 */
import { usePrinterStore } from '@/stores/printer-store';

import type * as TejasModule from 'td404-tejas-printer';

export type {
  Td404ConnectionEvent,
  Td404Device,
  Td404MonoLabelOptions,
  Td404MonoLabelResult,
  Td404PngLabelOptions,
  Td404PngLabelResult,
  RenderedPdfPage,
  RenderPdfResult,
} from 'td404-tejas-printer';

type Td404Module = typeof TejasModule;
export type Td404BridgeId = 'tejas' | 'rudra';

const cache: Partial<Record<Td404BridgeId, Td404Module | null>> = {};

function load(id: Td404BridgeId): Td404Module | null {
  if (cache[id] !== undefined) return cache[id] ?? null;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    cache[id] =
      id === 'rudra'
        ? (require('td404-rudra-printer') as Td404Module)
        : (require('td404-tejas-printer') as Td404Module);
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    cache[id] = null;
  }
  return cache[id] ?? null;
}

/** Which TD-404 bridge the currently selected printer uses. */
export function activeTd404BridgeId(): Td404BridgeId {
  return usePrinterStore.getState().selectedPrinterModel === 'rudra' ? 'rudra' : 'tejas';
}

/** Module for the selected printer, or null when its native module is missing. */
export function getTd404Bridge(): Td404Module | null {
  return load(activeTd404BridgeId());
}

function otherBridge(): Td404Module | null {
  return load(activeTd404BridgeId() === 'rudra' ? 'tejas' : 'rudra');
}

const missing = (name: string) => new Error(`TD-404 bridge unavailable (${name})`);

export function isTd404NativeAvailable(): boolean {
  return getTd404Bridge()?.isTd404NativeAvailable() ?? false;
}
export function isTd404BluetoothEnabled() {
  return getTd404Bridge()?.isTd404BluetoothEnabled() ?? null;
}
export async function debugLogTd404RemoteBattery(mac: string) {
  await getTd404Bridge()?.debugLogTd404RemoteBattery(mac);
}
export async function readSystemBluetoothBatteryPercent(mac: string) {
  const b = getTd404Bridge();
  if (!b) throw missing('battery');
  return b.readSystemBluetoothBatteryPercent(mac);
}
export async function getTd404BondedDevices() {
  return (await getTd404Bridge()?.getTd404BondedDevices()) ?? [];
}
/** Opens the system pairing dialog for an unpaired Tejas / Rudra printer. True once it is bonded. */
export async function pairTd404Device(mac: string): Promise<boolean> {
  const b = getTd404Bridge();
  if (!b) throw missing('pair');
  return b.pairTd404Device(mac);
}
export function startTd404Scan(...args: Parameters<Td404Module['startTd404Scan']>) {
  const b = getTd404Bridge();
  if (!b) throw missing('scan');
  return b.startTd404Scan(...args);
}
export async function connectTd404(macAddress: string, name: string | null) {
  const b = getTd404Bridge();
  if (!b) throw missing('connect');
  // Never leave the other printer's socket open.
  await otherBridge()?.disconnectTd404().catch(() => {});
  return b.connectTd404(macAddress, name);
}
/** True when the paired printer answers right now. Skipped (false) if the module lacks a probe. */
export async function probeTd404(mac: string, timeoutMs?: number): Promise<boolean> {
  const b = getTd404Bridge();
  return (await b?.probeTd404?.(mac, timeoutMs)) ?? false;
}
/** Disconnects both bridges so a printer switch can never leave a stale socket. */
export async function disconnectTd404() {
  await Promise.all([
    load('tejas')?.disconnectTd404().catch(() => {}),
    load('rudra')?.disconnectTd404().catch(() => {}),
  ]);
}
export function isTd404Connected(): boolean {
  return getTd404Bridge()?.isTd404Connected() ?? false;
}
export async function printTd404Base64(base64: string) {
  const b = getTd404Bridge();
  if (!b) throw missing('print');
  return b.printTd404Base64(base64);
}
export async function printTd404Raw(bytes: Uint8Array) {
  const b = getTd404Bridge();
  if (!b) throw missing('print');
  return b.printTd404Raw(bytes);
}
export async function printTd404PngLabel(...args: Parameters<Td404Module['printTd404PngLabel']>) {
  const b = getTd404Bridge();
  if (!b) throw missing('print');
  return b.printTd404PngLabel(...args);
}
export async function printTd404MonoLabel(...args: Parameters<Td404Module['printTd404MonoLabel']>) {
  const b = getTd404Bridge();
  if (!b) throw missing('print');
  return b.printTd404MonoLabel(...args);
}
export async function renderPdfPages(...args: Parameters<Td404Module['renderPdfPages']>) {
  return (await getTd404Bridge()?.renderPdfPages(...args)) ?? null;
}
/** Listens on both bridges; only the connected one ever emits. */
export function addTd404ConnectionListener(
  listener: Parameters<Td404Module['addTd404ConnectionListener']>[0],
): { remove: () => void } {
  const subs = (['tejas', 'rudra'] as const).map((id) => load(id)?.addTd404ConnectionListener(listener));
  return { remove: () => subs.forEach((s) => s?.remove()) };
}
export async function getTd404ConnectionInfo() {
  return (await getTd404Bridge()?.getTd404ConnectionInfo()) ?? null;
}
