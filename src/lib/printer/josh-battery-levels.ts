/**
 * Josh battery bars (1-4) from PrinterParam.batteryVoltage. The SDK has no ready level.
 *
 * UNCALIBRATED, guess: every number below is a starting guess for a 2-cell lithium pack
 * (6.0 V empty to 8.4 V full). The unit the DP27 reports is also unverified; the table is
 * compared against the raw number as reported. Calibrate on the device, then edit ONLY this table.
 */
export type JoshBatteryBars = 1 | 2 | 3 | 4;

export const JOSH_BATTERY_CALIBRATED = false;

/** Highest level whose minVoltage the reading reaches wins. Sorted ascending. */
export const JOSH_BATTERY_LEVELS: readonly { level: JoshBatteryBars; minVoltage: number }[] = [
  { level: 1, minVoltage: 0 }, // UNCALIBRATED, guess
  { level: 2, minVoltage: 7.0 }, // UNCALIBRATED, guess
  { level: 3, minVoltage: 7.5 }, // UNCALIBRATED, guess
  { level: 4, minVoltage: 8.0 }, // UNCALIBRATED, guess
];

/** 1-4, or null when the printer reported no usable voltage. Never throws. */
export function joshBatteryLevel(voltage: unknown): JoshBatteryBars | null {
  if (typeof voltage !== 'number' || !Number.isFinite(voltage) || voltage <= 0) return null;
  let level: JoshBatteryBars = 1;
  for (const row of JOSH_BATTERY_LEVELS) {
    if (voltage >= row.minVoltage) level = row.level;
  }
  return level;
}
