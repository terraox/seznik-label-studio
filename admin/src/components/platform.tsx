'use client';

import { useEffect, useState } from 'react';

import { Skeleton } from '@/components/ui';
import { api } from '@/lib/client';

export function platformKind(value: string | null | undefined): 'android' | 'ios' | 'web' | null {
  const v = (value ?? '').toLowerCase();
  if (v.includes('android')) return 'android';
  if (v === 'web') return 'web';
  if (v === 'ios' || v.includes('iphone') || v.includes('ipad') || v.includes('apple')) return 'ios';
  return null;
}

/** Android / iOS tag. */
export function PlatformTag({ value }: { value: string | null | undefined }) {
  const kind = platformKind(value);
  if (!kind) return <span className="u-muted">{value ?? '—'}</span>;
  return <span className={`ptag ${kind}`}>{kind === 'android' ? 'Android' : kind === 'ios' ? 'iOS' : 'Web'}</span>;
}

type Jobs = { android: number; ios: number; web: number };
const PLATFORMS = [
  { key: 'android', label: 'Android' },
  { key: 'ios', label: 'iOS' },
  { key: 'web', label: 'Web' },
] as const;
type Basis = 'prints' | 'users';
const BASES = [
  { id: 'prints', label: 'Prints' },
  { id: 'users', label: 'Registrations' },
] as const;

/** Numbers per platform, based on print jobs (default) or on registrations. */
export function PlatformCard({
  platforms,
  hideInternal,
}: {
  platforms: { platform: string | null; users: number }[] | undefined;
  hideInternal: boolean;
}) {
  const [basis, setBasis] = useState<Basis>('prints');
  const [jobs, setJobs] = useState<Jobs | null>(null);

  useEffect(() => {
    api<{ jobs: Jobs }>(`/api/stats/platforms${hideInternal ? '?internal=hide' : ''}`)
      .then((d) => setJobs(d.jobs))
      .catch(() => setJobs({ android: 0, ios: 0, web: 0 }));
  }, [hideInternal]);

  const registered = (key: string) => (platforms ?? []).filter((r) => platformKind(r.platform) === key).reduce((n, r) => n + r.users, 0);
  const valueOf = (key: (typeof PLATFORMS)[number]['key']) => (basis === 'prints' ? (jobs ? jobs[key] : null) : platforms ? registered(key) : null);
  const values = PLATFORMS.map((p) => valueOf(p.key));
  const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const noun = basis === 'prints' ? 'print job' : 'registered user';

  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="chart-head">
        <div>
          <h2>Platforms</h2>
          <p className="chart-sum">
            <b>{total.toLocaleString()}</b> <span>{noun}{total === 1 ? '' : 's'} · based on {basis === 'prints' ? 'prints (lifetime print jobs)' : 'registrations'}</span>
          </p>
        </div>
        <div className="seg" role="tablist" aria-label="Based on">
          {BASES.map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={basis === b.id} className={basis === b.id ? 'on' : ''} onClick={() => setBasis(b.id)}>{b.label}</button>
          ))}
        </div>
      </div>

      <div className="plat-tiles">
        {PLATFORMS.map((p, i) => {
          const value = values[i];
          return (
            <div key={p.key} className={`plat-tile${value === 0 ? ' is-empty' : ''}`}>
              <PlatformTag value={p.key} />
              <b>{value === null ? <Skeleton width={36} height={14} /> : value.toLocaleString()}</b>
              <span>{basis === 'prints' ? 'print jobs' : 'registered'}</span>
              <small>{value !== null && total ? `${Math.round((value / total) * 100)}% of ${noun}s` : ' '}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
