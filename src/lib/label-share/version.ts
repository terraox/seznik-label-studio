/** Dotted numeric version compare ("1.0.1"). Returns <0, 0, >0. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((p) => parseInt(p, 10) || 0);
  const pb = String(b).split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export const isVersionString = (v: unknown): v is string => typeof v === 'string' && /^\d{1,4}(\.\d{1,4}){0,3}$/.test(v);
