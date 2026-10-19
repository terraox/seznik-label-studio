'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cable, Printer, Star, UserPlus, Users } from 'lucide-react';

import { AnalyticsFooter, type FooterInfo } from '@/components/analytics-footer';
import { LabelsChart } from '@/components/labels-chart';
import { PlatformCard } from '@/components/platform';
import { TestAccounts } from '@/components/test-accounts';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';

type Summary = {
  users: { total: number; active: number; blocked: number; newLast7Days: number; internalAccounts: number };
  prints: { lifetimeLabels: number };
  platforms: { platform: string | null; users: number }[];
  printerModels: number;
  rating: { average: number | null; count: number };
  footer: FooterInfo;
};
type Prints = {
  lifetime: { labels: number; jobs: number };
  last7Days: { labels: number; jobs: number };
  thisMonth: { labels: number; jobs: number };
  daily: { day: string; labels: number; jobs: number }[];
  hourly: { hour: number; labels: number; jobs: number }[];
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

  const maxLabels = Math.max(1, ...labels.map((l) => l.labelsPrinted));

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
        <TestAccounts hide={hideInternal} count={summary?.users.internalAccounts} onHide={setHideInternal} onChanged={load} />
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

      <LabelsChart series={prints} />

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="chart-head">
          <div>
            <h2>Most printed labels</h2>
            <p className="chart-sum">Top {labels.length || 20} label sizes and templates</p>
          </div>
          <div className="seg">
            {WINDOWS.map((w) => (
              <button key={w.id} type="button" className={windowId === w.id ? 'on' : ''} onClick={() => setWindowId(w.id)}>{w.label}</button>
            ))}
          </div>
        </div>
        <div className="rank-wrap">
          <table className="table rank-table">
            <thead><tr><th>Label name</th><th className="num">Labels printed</th></tr></thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l.labelKey}>
                  <td>
                    <div className="rank-name">
                      <span className={`rank-no${l.rank <= 3 ? ` top${l.rank}` : ''}`}>{l.rank}</span>
                      <div>
                        <b>{l.display}</b>
                        {l.kind === 'template' ? <span className="badge draft">template</span> : null}
                        <div className="rank-bar"><i style={{ width: `${Math.max(3, (l.labelsPrinted / maxLabels) * 100)}%` }} /></div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{l.labelsPrinted.toLocaleString()}</td>
                </tr>
              ))}
              {labels.length === 0 ? <tr><td colSpan={2} className="empty">Nothing printed in this window yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <PlatformCard platforms={summary?.platforms} hideInternal={hideInternal} />

      <AnalyticsFooter footer={summary?.footer} />
    </>
  );
}
