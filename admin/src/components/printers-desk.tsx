'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cable, ChevronLeft, ChevronRight, Plug, Printer, Search, Users, X } from 'lucide-react';

import { useDesk, useHideInternal, useToast } from '@/components/desk';
import { AnalyticsFooter, type FooterInfo } from '@/components/analytics-footer';
import { Drawer, PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';

type PrinterRow = {
  key: string; model: string; family: string; deviceNames: number; users: number;
  connections: number; labels: number; firstSeen: string | null; lastConnected: string | null;
};
type DeviceRow = { name: string; line: string; model: string; family: string; users: number; connections: number; labels: number; firstSeen: string; lastConnected: string | null };
type Data = { devices: DeviceRow[]; uniqueModels: number; uniqueNames: number; totalConnections: number; usersWithPrinter: number; printers: PrinterRow[] };
type UserRow = { id: string; name: string; mobile: string; connections: number; labels: number; lastConnected: string | null };

const PAGE_SIZES = [10, 25, 50];
const FAMILIES = [{ id: 'tejas', label: 'Tejas' }, { id: 'rudra', label: 'Rudra' }, { id: 'josh', label: 'Josh' }];

/** Product line, read from the Bluetooth name on the server: B15 Tejas, B17 Rudra, LD0801 Josh. */
const matchesFamily = (p: { key?: string; line?: string }, family: string) => family === 'all' || (p.key ?? p.line) === family;

export function PrintersDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canSeeUsers = can(desk.role, 'users.view');

  const [data, setData] = useState<Data | null>(null);
  const [family, setFamily] = useState('all');
  const [hideInternal] = useHideInternal();
  const [error, setError] = useState('');
  const [open, setOpen] = useState<PrinterRow | null>(null);
  const [footer, setFooter] = useState<FooterInfo | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [view, setView] = useState<'models' | 'names'>('models');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<string>('connections');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (hideInternal) params.set('internal', 'hide');
    api<Data>(`/api/printers?${params}`).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
    api<{ footer: FooterInfo }>('/api/stats/summary').then((r) => setFooter(r.footer)).catch(() => {});
  }, [hideInternal]);

  useEffect(load, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const source: (PrinterRow | DeviceRow)[] = (view === 'models' ? data?.printers : data?.devices) ?? [];
    const list = source.filter((p) => {
      const label = 'name' in p ? `${p.name} ${p.model}` : p.model;
      return (!needle || label.toLowerCase().includes(needle)) && matchesFamily(p, family);
    });
    const sign = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = (a as Record<string, unknown>)[sort] ?? '';
      const y = (b as Record<string, unknown>)[sort] ?? '';
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sign;
    });
  }, [data, view, q, family, sort, dir]);
  // Cards follow the family filter (not the search box).
  const inFamily = useMemo(() => (data?.printers ?? []).filter((p) => matchesFamily(p, family)), [data, family]);
  const cards = data && family !== 'all'
    ? {
        models: inFamily.length,
        names: inFamily.reduce((n, p) => n + p.deviceNames, 0),
        connections: inFamily.reduce((n, p) => n + p.connections, 0),
        users: inFamily.reduce((n, p) => n + p.users, 0),
      }
    : data ? { models: data.uniqueModels, names: data.uniqueNames, connections: data.totalConnections, users: data.usersWithPrinter } : null;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * pageSize, current * pageSize);
  const from = rows.length ? (current - 1) * pageSize + 1 : 0;
  const to = Math.min(current * pageSize, rows.length);
  const sortBy = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir('desc'); }
    setPage(1);
  };
  const arrow = (key: string) => (sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '');
  const th = (key: string, label: string, center = false) => (
    <th className={center ? 'u-center' : undefined}><button className="th-sort" onClick={() => sortBy(key)}>{label}{arrow(key)}</button></th>
  );

  function openPrinter(row: PrinterRow) {
    setOpen(row);
    setUsers([]);
    if (!canSeeUsers) return;
    api<{ users: UserRow[] }>(`/api/printers/users?model=${encodeURIComponent(row.key)}${hideInternal ? '&internal=hide' : ''}`)
      .then((r) => setUsers(r.users))
      .catch((e: Error) => toast(e.message, 'bad'));
  }

  return (
    <>
      <PageHeader kicker="Hardware" title="Printers" lede="Which printers people connect, how many people use each, and how much they print. Names that differ only by a device suffix are grouped.">
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="Printer summary">
        {[
          { title: 'Unique printer models', value: cards?.models, sub: 'after merge rules', Icon: Printer, color: '#3B82F6' },
          { title: 'Unique device names', value: cards?.names, sub: 'as the printers report them', Icon: Cable, color: '#10B981' },
          { title: 'Connections', value: cards?.connections, sub: 'successful connects', Icon: Plug, color: '#8B5CF6' },
          { title: 'Users with a printer', value: cards?.users, sub: 'connected or printed', Icon: Users, color: '#F59E0B' },
        ].map(({ title, value, sub, Icon, color }) => (
          <article className="kpi" key={title}>
            <div className="kpi-top">
              <span className="kpi-title">{title}</span>
              <span className="kpi-icon" style={{ background: `${color}20`, border: `1px solid ${color}40` }}><Icon size={16} color={color} /></span>
            </div>
            <div className="kpi-value">{value === undefined ? '…' : value.toLocaleString()}</div>
            <div className="kpi-sub">{sub}</div>
          </article>
        ))}
      </section>

      <section className="panel users-panel">
        <div className="u-toolbar">
          <div className="u-search">
            <Search size={15} aria-hidden />
            <input type="search" placeholder={view === 'models' ? 'Search printers…' : 'Search Bluetooth names…'} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search printers" />
            {q ? <button type="button" className="u-clear" onClick={() => { setQ(''); setPage(1); }} aria-label="Clear search"><X size={14} /></button> : null}
          </div>
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'models' ? 'on' : ''} onClick={() => { setView('models'); setSort('connections'); setDir('desc'); setPage(1); }}>Overview</button>
            <button type="button" className={view === 'names' ? 'on' : ''} onClick={() => { setView('names'); setSort('connections'); setDir('desc'); setPage(1); }}>Bluetooth names</button>
          </div>
          <select className="u-select" value={family} onChange={(e) => { setFamily(e.target.value); setPage(1); }} aria-label="Printer family">
            <option value="all">All printers</option>
            {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>

        <div className="u-scroll">
          <table className="table u-table">
            <thead>
              <tr>
                {view === 'models' ? th('model', 'Printer') : th('name', 'Printer (Bluetooth name)')}
                <th>SDK family</th>
                {view === 'models' ? th('deviceNames', 'Device names', true) : null}
                {th('users', 'Users', true)}
                {th('connections', 'Connections', true)}
                {th('labels', 'Labels printed', true)}
                {th('firstSeen', 'First seen')}
                {th('lastConnected', 'Last connected')}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const device = 'name' in p ? p : null;
                const model = !device ? (p as PrinterRow) : null;
                return (
                  <tr key={device ? device.name : model!.key} onClick={model ? () => openPrinter(model) : undefined} className={model ? 'u-row' : undefined}>
                    <td>
                      {device ? <b className="u-mono">{device.name}</b> : (
                        <div className="u-printer">
                          <b>{p.model}</b>
                          <Link className="u-link" href={`/printers/${(p as PrinterRow).key}`} onClick={(e) => e.stopPropagation()}>Show all BT names</Link>
                        </div>
                      )}
                    </td>
                    <td><span className="badge draft">{p.family}</span></td>
                    {model ? <td className="u-center">{model.deviceNames}</td> : null}
                    <td className="u-center">{p.users}</td>
                    <td className="u-center">{p.connections.toLocaleString()}</td>
                    <td className="u-center u-labels">{p.labels.toLocaleString()}</td>
                    <td>{p.firstSeen ? ago(p.firstSeen) : <span className="u-muted">—</span>}</td>
                    <td>{p.lastConnected ? ago(p.lastConnected) : <span className="u-muted">—</span>}</td>
                  </tr>
                );
              })}
              {!data ? <tr><td colSpan={8} className="empty">Loading printers…</td></tr> : null}
              {data && rows.length === 0 ? <tr><td colSpan={8} className="empty">{q ? 'Nothing matches this search.' : 'No printers have connected yet.'}</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="u-pager">
          <nav className="pager" aria-label="Pages">
            <button className="pager-step" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, current - 3), current + 2).map((n) => (
              <button key={n} className={`pager-n${n === current ? ' on' : ''}`} onClick={() => setPage(n)} aria-current={n === current ? 'page' : undefined}>{n}</button>
            ))}
            <button className="pager-step" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
          <label className="u-size">Rows per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="u-count">Showing {from.toLocaleString()}–{to.toLocaleString()} of {rows.length.toLocaleString()}</span>
        </div>
      </section>

      <AnalyticsFooter footer={footer} />

      {open ? (
        <Drawer title={open.model} lede={`${open.family} · ${open.deviceNames} device name(s) · ${open.connections} connections`} onClose={() => setOpen(null)}>
          {canSeeUsers ? (
            <>
              <h2 style={{ fontSize: '1rem' }}>People using it</h2>
              <table className="table">
                <thead><tr><th>Name</th><th>Mobile</th><th>Connected</th><th>Labels</th><th>Last</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}><td>{u.name}</td><td>{u.mobile}</td><td>{u.connections}</td><td>{u.labels}</td><td>{u.lastConnected ? ago(u.lastConnected) : '—'}</td></tr>
                  ))}
                  {users.length === 0 ? <tr><td colSpan={5}>Loading…</td></tr> : null}
                </tbody>
              </table>
            </>
          ) : <p>Your role does not include user details.</p>}
        </Drawer>
      ) : null}
    </>
  );
}
