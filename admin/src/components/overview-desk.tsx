'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Cable, Printer, Star, UserPlus, Users } from 'lucide-react';

import { AnalyticsFooter, type FooterInfo } from '@/components/analytics-footer';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';

type Summary = {
  users: { total: number; active: number; blocked: number; newLast7Days: number; internalAccounts: number };
  prints: { lifetimeLabels: number };
  printerModels: number;
  rating: { average: number | null; count: number };
  footer: FooterInfo;
};
type Prints = {
  lifetime: { labels: number; jobs: number };
  last7Days: { labels: number; jobs: number };
  thisMonth: { labels: number; jobs: number };
  daily: { day: string; labels: number; jobs: number }[];
};
type LabelRow = { rank: number; labelKey: string; display: string; kind: string; labelsPrinted: number; jobs: number; users: number };

const WINDOWS = [
  { id: '7d', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'Lifetime' },
];

export function OverviewDesk() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prints, setPrints] = useState<Prints | null>(null);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [windowId, setWindowId] = useState('all');
  const [hideInternal, setHideInternal] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = hideInternal ? 'internal=hide' : '';
    Promise.all([
      api<Summary>(`/api/stats/summary?${q}`),
      api<Prints>(`/api/stats/prints?${q}`),
      api<{ labels: LabelRow[] }>(`/api/stats/labels?${q}&window=${windowId}&limit=20`),
    ])
      .then(([s, p, l]) => {
        setSummary(s);
        setPrints(p);
        setLabels(l.labels);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, [hideInternal, windowId]);

  useEffect(load, [load]);

  const cards = [
    { title: 'Total users', value: summary?.users.total, sub: `${summary?.users.active ?? 0} active · ${summary?.users.blocked ?? 0} blocked`, Icon: Users, color: '#3B82F6' },
    { title: 'New in 7 days', value: summary?.users.newLast7Days, sub: 'registered recently', Icon: UserPlus, color: '#8B5CF6' },
    { title: 'Labels printed', value: summary?.prints.lifetimeLabels, sub: 'lifetime, sent to a printer', Icon: Printer, color: '#10B981' },
    { title: 'Printer models', value: summary?.printerModels, sub: 'unique, after merge rules', Icon: Cable, color: '#F59E0B' },
    { title: 'Average rating', value: summary ? (summary.rating.average ?? '—') : undefined, sub: `${summary?.rating.count ?? 0} ratings`, Icon: Star, color: '#EF4444' },
  ];

  const totals = [
    { title: 'Lifetime', block: prints?.lifetime },
    { title: 'Last 7 days', block: prints?.last7Days },
    { title: 'This month (IST)', block: prints?.thisMonth },
  ];

  return (
    <>
      <PageHeader kicker="Overview" title="How the app is being used" lede="People, printers and labels printed. Windows use India time; the last 7 days is a rolling 7 x 24 hours.">
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} />
          Exclude internal / test accounts{summary ? ` (${summary.users.internalAccounts})` : ''}
        </label>
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="Summary">
        {cards.map(({ title, value, sub, Icon, color }) => (
          <article className="kpi" key={title}>
            <div className="kpi-top">
              <span className="kpi-title">{title}</span>
              <span className="kpi-icon" style={{ background: `${color}20`, border: `1px solid ${color}40` }}><Icon size={16} color={color} /></span>
            </div>
            <div className="kpi-value">{value === undefined ? '…' : typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="kpi-sub">{sub}</div>
          </article>
        ))}
      </section>

      <section className="kpis" aria-label="Print totals">
        {totals.map(({ title, block }) => (
          <article className="kpi" key={title}>
            <div className="kpi-top"><span className="kpi-title">Labels · {title}</span></div>
            <div className="kpi-value">{block ? block.labels.toLocaleString() : '…'}</div>
            <div className="kpi-sub">{block ? `${block.jobs.toLocaleString()} print job${block.jobs === 1 ? '' : 's'}` : ''}</div>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Labels printed per day (last 30 days)</h2>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={prints?.daily ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} interval={4} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={40} />
              <Tooltip formatter={(v) => [Number(v ?? 0).toLocaleString(), 'Labels']} labelFormatter={(d) => `${d} (IST)`} />
              <Bar dataKey="labels" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Most printed labels</h2>
        <div className="chips" style={{ marginBottom: 12 }}>
          {WINDOWS.map((w) => (
            <button key={w.id} type="button" className={windowId === w.id ? 'chip active' : 'chip'} onClick={() => setWindowId(w.id)}>{w.label}</button>
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>#</th><th>Label</th><th>Labels printed</th><th>Jobs</th><th>People</th></tr></thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l.labelKey}>
                  <td>{l.rank}</td>
                  <td>{l.display} {l.kind === 'template' ? <span className="badge draft">template</span> : null}</td>
                  <td>{l.labelsPrinted.toLocaleString()}</td>
                  <td>{l.jobs.toLocaleString()}</td>
                  <td>{l.users}</td>
                </tr>
              ))}
              {labels.length === 0 ? <tr><td colSpan={5}>Nothing printed in this window yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <AnalyticsFooter footer={summary?.footer} />
    </>
  );
}
