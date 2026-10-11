/**
 * Maps LPAPI `batteryVoltage` readings to 0–100 for tests and docs.
 * Production mapping lives in JoshPrinterManager.mapJoshBatteryToPercent (Kotlin).
 */
export function joshBatteryVoltageToPercent(voltage: number): number | null {
  if (!Number.isFinite(voltage) || voltage <= 0) return null;
  if (voltage >= 1 && voltage <= 100 && Math.abs(voltage - Math.round(voltage)) < 0.01) {
    const p = Math.round(voltage);
    if (p >= 0 && p <= 100) return p;
  }
  if (voltage >= 280 && voltage <= 435) return liIonSinglePercent(voltage / 100);
  if (voltage >= 2.8 && voltage <= 4.35) return liIonSinglePercent(voltage);
  if (voltage >= 600 && voltage <= 850) return liIon2sPercent(voltage / 100);
  if (voltage >= 6 && voltage <= 8.5) return liIon2sPercent(voltage);
  return null;
}

function liIonSinglePercent(volts: number): number {
  return Math.min(100, Math.max(0, Math.round(((volts - 3) / (4.2 - 3)) * 100)));
}

function liIon2sPercent(volts: number): number {
  return Math.min(100, Math.max(0, Math.round(((volts - 6) / (8.4 - 6)) * 100)));
}
