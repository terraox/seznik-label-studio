'use client';

import { useEffect, useState } from 'react';

import { EChartsComposedChart, type ChartConfig } from '@/components/evilcharts/charts/echarts-composed-chart';
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

type Daily = { day: string; android: number; ios: number; web: number };
const PLATFORMS = [
  { key: 'android', label: 'Android', colors: { light: ['#10b981', '#34d399'], dark: ['#34d399', '#6ee7b7'] } },
  { key: 'ios', label: 'iOS', colors: { light: ['#64748b', '#94a3b8'], dark: ['#94a3b8', '#cbd5e1'] } },
  { key: 'web', label: 'Web', colors: { light: ['#6366f1', '#8b5cf6'], dark: ['#818cf8', '#a78bfa'] } },
] as const;
const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** Users per platform, plus how many of them printed each day, as a card for the overview. */
export function PlatformCard({
  platforms,
  hideInternal,
}: {
  platforms: { platform: string | null; users: number }[] | undefined;
  hideInternal: boolean;
}) {
  const rows = [...(platforms ?? [])].sort((a, b) => b.users - a.users);
  const total = rows.reduce((sum, p) => sum + p.users, 0);
  const [daily, setDaily] = useState<Daily[] | null>(null);
  const [range, setRange] = useState<7 | 30>(7);

  useEffect(() => {
    api<{ daily: Daily[] }>(`/api/stats/platforms${hideInternal ? '?internal=hide' : ''}`)
      .then((d) => setDaily(d.daily))
      .catch(() => setDaily([]));
  }, [hideInternal]);

  const registered = (key: string) => rows.filter((r) => platformKind(r.platform) === key).reduce((n, r) => n + r.users, 0);
  const window = (daily ?? []).slice(-range);
  // Show a platform in the chart once anyone has registered on it or been active on it.
  const shown = PLATFORMS.filter((p) => registered(p.key) > 0 || window.some((d) => d[p.key] > 0));
  const config: ChartConfig = Object.fromEntries(
    shown.map((p) => [p.key, { label: p.label, colors: { light: [...p.colors.light], dark: [...p.colors.dark] } }]),
  );
  const data = window.map((d) => ({ label: dayName(d.day), android: d.android, ios: d.ios, web: d.web }));
  const todayRow = daily?.[daily.length - 1];

  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="chart-head">
        <div>
          <h2>Platforms</h2>
          <p className="chart-sum"><b>{total.toLocaleString()}</b> <span>user{total === 1 ? '' : 's'} by phone type · active = printed that day (IST)</span></p>
        </div>
        <div className="seg" role="tablist" aria-label="Range">
          {([7, 30] as const).map((n) => (
            <button key={n} type="button" role="tab" aria-selected={range === n} className={range === n ? 'on' : ''} onClick={() => setRange(n)}>{n} days</button>
          ))}
        </div>
      </div>

      <div className="plat-tiles">
        {PLATFORMS.map((p) => {
          const users = registered(p.key);
          const active = todayRow ? todayRow[p.key] : null;
          return (
            <div key={p.key} className={`plat-tile${users === 0 && !active ? ' is-empty' : ''}`}>
              <PlatformTag value={p.key} />
              <b>{active === null ? '…' : active.toLocaleString()}</b>
              <span>active today</span>
              <small>{users.toLocaleString()} registered{total ? ` · ${Math.round((users / total) * 100)}%` : ''}</small>
            </div>
          );
        })}
      </div>

      <div className="chart-box" style={{ height: 260 }}>
        {daily === null ? (
          <p className="loading">Loading chart…</p>
        ) : shown.length === 0 ? (
          <p className="empty" style={{ margin: 'auto' }}>No users yet.</p>
        ) : (
          <EChartsComposedChart key={`${range}-${shown.length}`} className="h-full w-full" xDataKey="label" data={data} config={config}>
            <EChartsComposedChart.Grid />
            <EChartsComposedChart.XAxis dataKey="label" />
            <EChartsComposedChart.YAxis />
            <EChartsComposedChart.Legend isClickable variant="rounded-square" />
            <EChartsComposedChart.Tooltip variant="frosted-glass" />
            {shown.map((p) => (
              <EChartsComposedChart.Bar key={p.key} dataKey={p.key} variant="gradient" isClickable enableHoverHighlight />
            ))}
          </EChartsComposedChart>
        )}
      </div>
    </section>
  );
}
