'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';

import { useHideInternal } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';

type Device = {
  name: string; line: string; family: string; users: number; connections: number;
  labels: number; firstSeen: string; lastConnected: string | null;
};

/** Every Bluetooth name that has connected for one printer line (Tejas, Rudra or Josh). */
export function PrinterNamesDesk({ line, label }: { line: string; label: string }) {
  const [hideInternal] = useHideInternal();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<keyof Device>('connections');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(() => {
    api<{ devices: Device[] }>(`/api/printers${hideInternal ? '?internal=hide' : ''}`)
      .then((d) => { setDevices(d.devices.filter((x) => x.line === line)); setError(''); })
      .catch((e: Error) => setError(e.message));
  }, [hideInternal, line]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sign = dir === 'asc' ? 1 : -1;
    return (devices ?? [])
      .filter((d) => !needle || d.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = a[sort] ?? '';
        const y = b[sort] ?? '';
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sign;
      });
  }, [devices, q, sort, dir]);

  const sortBy = (key: keyof Device) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir('desc'); }
  };
  const th = (key: keyof Device, text: string, center = false) => (
    <th className={center ? 'u-center' : undefined}>
      <button className="th-sort" onClick={() => sortBy(key)}>{text}{sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
    </th>
  );

  return (
    <>
      <PageHeader kicker="Hardware" title={`${label} · Bluetooth names`} lede={`Every ${label} printer that has connected, by the name it shows over Bluetooth.`}>
        <Link className="btn" href="/printers"><ArrowLeft size={14} /> Back to printers</Link>
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="panel users-panel">
        <div className="u-toolbar">
          <div className="u-search">
            <Search size={15} aria-hidden />
            <input type="search" placeholder="Search Bluetooth names…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Bluetooth names" />
            {q ? <button type="button" className="u-clear" onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button> : null}
          </div>
          <span className="u-count" style={{ marginLeft: 'auto' }}>{rows.length.toLocaleString()} name{rows.length === 1 ? '' : 's'}</span>
        </div>
        <div className="u-scroll">
          <table className="table u-table">
            <thead>
              <tr>
                {th('name', 'Bluetooth name')}
                <th>SDK family</th>
                {th('users', 'Users', true)}
                {th('connections', 'Connections', true)}
                {th('labels', 'Labels printed', true)}
                {th('firstSeen', 'First seen')}
                {th('lastConnected', 'Last connected')}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.name}>
                  <td><b className="u-mono">{d.name}</b></td>
                  <td><span className="badge draft">{d.family}</span></td>
                  <td className="u-center">{d.users}</td>
                  <td className="u-center">{d.connections.toLocaleString()}</td>
                  <td className="u-center u-labels">{d.labels.toLocaleString()}</td>
                  <td>{ago(d.firstSeen)}</td>
                  <td>{d.lastConnected ? ago(d.lastConnected) : <span className="u-muted">—</span>}</td>
                </tr>
              ))}
              {!devices ? <tr><td colSpan={7} className="empty">Loading…</td></tr> : null}
              {devices && rows.length === 0 ? <tr><td colSpan={7} className="empty">{q ? 'No name matches this search.' : 'No printer of this line has connected yet.'}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
