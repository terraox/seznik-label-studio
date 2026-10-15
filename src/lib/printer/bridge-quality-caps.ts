/**
 * Per-bridge darkness and speed capability, switched by the connected printer.
 * `'legacy'` keeps that bridge's existing controls and resolution untouched.
 */

import {
  JOSH_DENSITY_MAX,
  JOSH_DENSITY_MIN,
  JOSH_SPEED_MAX,
  JOSH_SPEED_MIN,
} from '@/lib/printer/josh-job-params';

export type BridgeId =
  | 'td404-spp'
  | 'ble'
  | 'wifi'
  | 'josh-lpapi'
  | 'tez-spp'
  | 'dev-spp'
  | 'labelx-spp';

export type QualityScale = {
  min: number;
  max: number;
  step: number;
  /** Value Manual mode starts from. */
  default: number;
  /** Highest value confirmed on a device; above it the UI says "not tested". */
  testedMax?: number;
  label: string;
  /**
   * When false, Manual darkness only changes the SDK heat value (Josh LPAPI).
   * TD-404 also shifts the bitmap threshold / ink steps.
   */
  bitmapInk?: boolean;
};

export type QualityCap = QualityScale | 'legacy';

export type BridgeQualityCaps = { density: QualityCap; speed: QualityCap };

const LEGACY: BridgeQualityCaps = { density: 'legacy', speed: 'legacy' };

/**
 * TD-404 (Ninestar labelprinter.aar): LabelCommand.DENSITY is 0-15, LabelCommand.SPEED is
 * 1.5 and 1-12. The TSPL manual limits speed to 0-3 (401/402) and 0-7 (403); the TD-404 is
 * not listed. Td404PrinterModule sends both as Int, so 1.5 cannot be sent.
 * SDK speed values for a later change: [1.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].
 */
export const TD404_QUALITY_CAPS: BridgeQualityCaps = {
  density: { min: 0, max: 15, step: 1, default: 10, label: 'Darkness' },
  speed: { min: 1, max: 7, step: 1, default: 3, label: 'Speed' },
};

/**
 * DothanTech LPAPI PrintParamValue: darkness 0–14, speed 0–4.
 * Jobs use speed 1–4 (0 stalls the first label). Auto is density 10 / speed 3.
 */
export const JOSH_QUALITY_CAPS: BridgeQualityCaps = {
  density: {
    min: JOSH_DENSITY_MIN,
    max: JOSH_DENSITY_MAX,
    step: 1,
    default: 10,
    label: 'Darkness',
    bitmapInk: false,
  },
  speed: { min: JOSH_SPEED_MIN, max: JOSH_SPEED_MAX, step: 1, default: 3, label: 'Speed' },
};

export const BRIDGE_QUALITY_CAPS: Record<BridgeId, BridgeQualityCaps> = {
  'td404-spp': TD404_QUALITY_CAPS,
  ble: LEGACY,
  wifi: LEGACY,
  'josh-lpapi': JOSH_QUALITY_CAPS,
  'tez-spp': LEGACY,
  'dev-spp': LEGACY,
  'labelx-spp': LEGACY,
};

export function qualityCapsFor(bridge: BridgeId | null | undefined): BridgeQualityCaps {
  return (bridge && BRIDGE_QUALITY_CAPS[bridge]) || LEGACY;
}

export function hasManualScale(caps: BridgeQualityCaps): boolean {
  return caps.density !== 'legacy' || caps.speed !== 'legacy';
}

/**
 * Bridge for the controls on screen: the live transport, or the remembered TD-404
 * classic-Bluetooth link before the manager restores it.
 */
export function resolveQualityBridge(opts: {
  activeTransport: BridgeId | null;
  storeTransport: string | null;
  sdkId: string | null;
}): BridgeId | null {
  if (opts.activeTransport) return opts.activeTransport;
  if (opts.sdkId === 'td404' && opts.storeTransport === 'bluetooth-spp') return 'td404-spp';
  if (opts.sdkId === 'josh') return 'josh-lpapi';
  return null;
}

/** Null (Auto) passes through; numbers snap to the step and clamp to the scale. */
export function clampToCap(
  value: number | null,
  cap: QualityCap,
): { value: number | null; clamped: boolean } {
  if (value == null || cap === 'legacy') return { value, clamped: false };
  const snapped = cap.min + Math.round((value - cap.min) / cap.step) * cap.step;
  const next = Math.min(cap.max, Math.max(cap.min, snapped));
  return { value: next, clamped: next !== value };
}

/** "Darkness 10 of 15", or "Darkness Auto". */
export function formatScale(value: number | null, cap: QualityScale): string {
  return value == null ? `${cap.label} Auto` : `${cap.label} ${value} of ${cap.max}`;
}

/** Stepper value text: "Auto" or "10 of 15". */
export function scaleValueText(value: number | null, cap: QualityScale): string {
  return value == null ? 'Auto' : `${value} of ${cap.max}`;
}

/**
 * One stepper tap. From Auto either button enters Manual at the default.
 * Past min/max wraps back to Auto so both printers can set Auto from the stepper.
 */
export function stepQuality(value: number | null, cap: QualityScale, direction: 1 | -1): number | null {
  if (value == null) return cap.default;
  const next = value + direction * cap.step;
  if (next < cap.min || next > cap.max) return null;
  return clampToCap(next, cap).value ?? cap.default;
}

/**
 * Darkness and speed change line thickness, so a position calibration only holds for the
 * density and speed it was printed at. Null when they match or were not recorded.
 */
export function calibrationQualityWarning(
  saved: { density?: number; speed?: number } | null | undefined,
  current: { density: number; speed: number },
): string | null {
  if (saved?.density == null || saved.speed == null) return null;
  if (saved.density === current.density && saved.speed === current.speed) return null;
  return (
    `Offsets were set at darkness ${saved.density}, speed ${saved.speed}; this print uses ` +
    `darkness ${current.density}, speed ${current.speed}. Lines may shift 0.1-0.2 mm.`
  );
}

/** Manual darkness minus the scale default, for the bitmap darkness pass. 0 for Auto / legacy / Josh. */
export function darknessSteps(darkness: number | null, caps: BridgeQualityCaps): number {
  if (caps.density === 'legacy' || caps.density.bitmapInk === false) return 0;
  const value = clampToCap(darkness, caps.density).value;
  return value == null ? 0 : value - caps.density.default;
}

export function isUntested(value: number | null, cap: QualityCap): boolean {
  return value != null && cap !== 'legacy' && cap.testedMax != null && value > cap.testedMax;
}
