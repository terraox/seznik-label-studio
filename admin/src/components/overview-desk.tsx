'use client';

import { useEffect, useState } from 'react';
import { LayoutTemplate, Printer, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { PRINTERS } from '@/lib/constants';
import { ago } from '@/lib/format';
import type { Telemetry } from '@/lib/types';

const WINDOWS = [
  ['today', 'Today'],
  ['last3', 'Last 3 days'],
  ['last7', 'Last 7 days'],
  ['month', 'This month'],
  ['lifetime', 'Lifetime'],
] as const;

export function OverviewDesk() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    api<Telemetry>('/api/telemetry').then(setData).catch((reason: Error) => setError(reason.message));
  }

  useEffect(load, []);

  const max = Math.max(1, ...(data?.byTemplate.map((row) => row.count) ?? [1]));

  return (
    <>
      <PageHeader
        kicker="Telemetry"
        title="How the app is being used"
        lede="Which phones have opened the app, what is published, and what actually printed."
      >
        <a className="btn" href="/api/export?type=devices">Devices CSV</a>
        <a className="btn" href="/api/export?type=prints">Prints CSV</a>
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}
      {!data ? <p className="loading">Pulling the latest counts…</p> : (
        <>
          <section className="kpis" aria-label="Summary">
            {[
              { title: 'Devices', value: data.devices.total, sub: `${data.devices.active7d} opened the app in 7 days`, Icon: Smartphone, color: '#3B82F6' },
              { title: 'Published templates', value: data.templates.published, sub: `${data.templates.drafts} still in draft`, Icon: LayoutTemplate, color: '#10B981' },
              { title: 'Prints, lifetime', value: data.prints.lifetime, sub: `${data.prints.month} this month`, Icon: Printer, color: '#8B5CF6' },
            ].map(({ title, value, sub, Icon, color }) => (
              <article className="kpi" key={title}>
                <div className="kpi-top">
                  <span className="kpi-title">{title}</span>
                  <span className="kpi-icon" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
                    <Icon size={16} color={color} />
                  </span>
                </div>
                <div className="kpi-value">{value.toLocaleString()}</div>
                <div className="kpi-sub">{sub}</div>
              </article>
            ))}
          </section>
          <section className="kpis" aria-label="Print counts">
            {WINDOWS.map(([key, label]) => (
              <article className="kpi" key={key}>
                <span className="kpi-title">{label}</span>
                <div className="kpi-value">{data.prints[key].toLocaleString()}</div>
                <div className="kpi-sub">{key === 'last3' || key === 'last7' ? 'Includes today' : 'Print events'}</div>
              </article>
            ))}
          </section>
          <div className="split">
            <section className="panel">
              <h2>Prints by template</h2>
              {data.byTemplate.map((row) => (
                <div className="bar-row" key={row.id}>
                  <span>{row.name}</span>
                  <div className="bar" aria-hidden><i style={{ width: `${(row.count / max) * 100}%` }} /></div>
                  <b>{row.count}</b>
                </div>
              ))}
              <a className="btn small" href="/api/export?type=template-usage">Download CSV</a>
            </section>
            <div className="stack">
              <section className="panel">
                <h2>Printers</h2>
                <div className="mix" aria-hidden>
                  {data.byPrinter.filter((row) => row.count > 0).map((row) => (
                    <span key={row.id} style={{ flex: row.count, background: PRINTERS.find((item) => item.id === row.id)?.color }} />
                  ))}
                </div>
                <div className="legend">
                  {data.byPrinter.map((row) => (
                    <span key={row.id}>
                      <i style={{ background: PRINTERS.find((item) => item.id === row.id)?.color }} />
                      {row.label} · {row.count}
                    </span>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h2>Latest prints</h2>
                <ul className="feed">
                  {data.recent.map((row) => (
                    <li key={row.id}>
                      <strong>{row.templateName}</strong>
                      <span>{ago(row.at)}</span>
                      <small>{row.printer}</small>
                      <small>{row.device}</small>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
