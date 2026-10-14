/** TD-404 / Tejas / Rudra are AC-powered; they do not expose a meaningful battery level. */
export function printerReportsBattery(ctx: { sdkId?: string | null; transport?: string | null }): boolean {
  if (ctx.sdkId === 'td404') return false;
  if (ctx.transport === 'td404-spp') return false;
  return true;
}

/** Map a raw SDK/OS reading to 0–100, or null when the printer did not report a level. */
export function normalizeBatteryPercent(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
}
