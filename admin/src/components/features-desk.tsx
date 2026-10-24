'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { PageHeader, Skeleton, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';

type Feature = { key: string; label: string; group: string; clicks: number; share: number; last7Days: number; last30Days: number; lastClick: string | null };
type Data = {
  range: string; total: number; trackingSince: string | null;
  features: Feature[]; groups: { id: string; label: string; clicks: number }[];
  trend: { day: string; clicks: number }[];
};

const RANGES = [{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: 'all', label: 'All time' }];

export function FeaturesDesk() {
  const [data, setData] = useState<Data | null>(null);
  const [range, setRange] = useState('30');
  const [group, setGroup] = useState('all');
  const [feature, setFeature] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ range });
    if (feature) params.set('feature', feature);
    api<Data>(`/api/stats/features?${params}`).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, [range, feature]);

  useEffect(load, [load]);

  const rows = data?.features.filter((f) => group === 'all' || f.group === group) ?? [];
  const top = data?.features[0];
  const max = Math.max(1, ...rows.map((f) => f.clicks));
  const selected = data?.features.find((f) => f.key === feature);

  return (
    <>
      <PageHeader kicker="Usage" title="Most used sections" lede="Taps on app sections, counted overall. Nobody is tracked: a tap is stored without any account.">
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
        </div>
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="panel">
        <p className="lede">
          {data ? (
            data.total === 0
              ? 'No taps in this range yet.'
              : `${data.total.toLocaleString()} taps. Most used: ${top?.label} (${Math.round((top?.share ?? 0) * 100)}%).`
          ) : <Skeleton width={260} />}
          {data?.trackingSince ? <span className="u-muted"> · counting since {new Date(data.trackingSince).toLocaleDateString()}</span> : null}
        </p>

        <div className="seg" role="group" aria-label="Section group" style={{ marginBottom: 12 }}>
          <button type="button" className={group === 'all' ? 'on' : ''} onClick={() => setGroup('all')}>All</button>
          {data?.groups.map((g) => (
            <button key={g.id} type="button" className={group === g.id ? 'on' : ''} onClick={() => setGroup(g.id)}>
              {g.label} ({g.clicks.toLocaleString()})
            </button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>#</th><th>Section</th><th>Group</th><th style={{ minWidth: 180 }}>Taps</th><th>Share</th><th>Last 7 days</th><th>Last 30 days</th><th>Last tap</th></tr></thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={f.key} onClick={() => setFeature(feature === f.key ? '' : f.key)} style={{ cursor: 'pointer', fontWeight: feature === f.key ? 700 : 400 }}>
                  <td>{i + 1}</td>
                  <td>{f.label}</td>
                  <td>{data?.groups.find((g) => g.id === f.group)?.label}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--paper-2)' }}>
                        <div style={{ width: `${(f.clicks / max) * 100}%`, height: '100%', borderRadius: 4, background: '#8B5CF6' }} />
                      </div>
                      <span style={{ minWidth: 40, textAlign: 'right' }}>{f.clicks.toLocaleString()}</span>
                    </div>
                  </td>
                  <td>{Math.round(f.share * 100)}%</td>
                  <td>{f.last7Days.toLocaleString()}</td>
                  <td>{f.last30Days.toLocaleString()}</td>
                  <td>{f.lastClick ? ago(f.lastClick) : 'Never'}</td>
                </tr>
              ))}
              {!data ? <SkeletonRows cols={8} /> : null}
            </tbody>
          </table>
        </div>
      </section>

      {data ? (
        <section className="panel" style={{ marginTop: 14 }}>
          <h2>{selected ? selected.label : 'All sections'}: taps per day (last 30 days, IST)</h2>
          <p className="u-muted">{selected ? 'Click the row again to go back to all sections.' : 'Click a row to see one section.'}</p>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} interval={4} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={32} />
                <Tooltip formatter={(v) => [Number(v ?? 0), 'Taps']} />
                <Bar dataKey="clicks" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}
    </>
  );
}
