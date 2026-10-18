'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cable, Plug, Printer, Users } from 'lucide-react';

import { useDesk, useToast } from '@/components/desk';
import { AnalyticsFooter, type FooterInfo } from '@/components/analytics-footer';
import { Drawer, Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';

type PrinterRow = {
  key: string; model: string; family: string; deviceNames: number; users: number;
  connections: number; labels: number; firstSeen: string; lastConnected: string | null;
};
type Data = { uniqueModels: number; uniqueNames: number; totalConnections: number; usersWithPrinter: number; printers: PrinterRow[] };
type UserRow = { id: string; name: string; mobile: string; connections: number; labels: number; lastConnected: string | null };
type Alias = { id: string; pattern: string; displayName: string; createdAt: string };

const FAMILIES = ['dev', 'tez', 'josh', 'labelx', 'td404', 'unknown'];

export function PrintersDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canEdit = can(desk.role, 'printers.edit');
  const canSeeUsers = can(desk.role, 'users.view');

  const [data, setData] = useState<Data | null>(null);
  const [family, setFamily] = useState('all');
  const [hideInternal, setHideInternal] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<PrinterRow | null>(null);
  const [footer, setFooter] = useState<FooterInfo | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [pattern, setPattern] = useState('');
  const [model, setModel] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (hideInternal) params.set('internal', 'hide');
    if (family !== 'all') params.set('family', family);
    api<Data>(`/api/printers?${params}`).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
    api<{ footer: FooterInfo }>('/api/stats/summary').then((r) => setFooter(r.footer)).catch(() => {});
    api<{ aliases: Alias[] }>('/api/printer-aliases').then((r) => setAliases(r.aliases)).catch(() => {});
  }, [family, hideInternal]);

  useEffect(load, [load]);

  function openPrinter(row: PrinterRow) {
    setOpen(row);
    setUsers([]);
    if (!canSeeUsers) return;
    api<{ users: UserRow[] }>(`/api/printers/users?model=${encodeURIComponent(row.key)}${hideInternal ? '&internal=hide' : ''}`)
      .then((r) => setUsers(r.users))
      .catch((e: Error) => toast(e.message, 'bad'));
  }

  async function addAlias() {
    try {
      const r = await api<{ printersChanged: number }>('/api/printer-aliases', { method: 'POST', body: JSON.stringify({ pattern, model }) });
      toast(`Rule saved. ${r.printersChanged} printer name(s) updated`);
      setPattern('');
      setModel('');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'bad');
    }
  }

  async function removeAlias(id: string) {
    try {
      await api(`/api/printer-aliases/${id}`, { method: 'DELETE' });
      toast('Rule removed');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove', 'bad');
    }
  }

  return (
    <>
      <PageHeader kicker="Hardware" title="Printers" lede="Which printers people connect, how many people use each, and how much they print. Names that differ only by a device suffix are grouped.">
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="Printer summary">
        {[
          { title: 'Unique printer models', value: data?.uniqueModels, sub: 'after merge rules', Icon: Printer, color: '#3B82F6' },
          { title: 'Unique device names', value: data?.uniqueNames, sub: 'as the printers report them', Icon: Cable, color: '#10B981' },
          { title: 'Connections', value: data?.totalConnections, sub: 'successful connects', Icon: Plug, color: '#8B5CF6' },
          { title: 'Users with a printer', value: data?.usersWithPrinter, sub: 'connected or printed', Icon: Users, color: '#F59E0B' },
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

      <section className="panel">
        <div className="toolbar">
          <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="SDK family">
            <option value="all">All SDK families</option>
            {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} /> Exclude internal / test accounts
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Printer model</th><th>SDK family</th><th>Device names</th><th>Users</th><th>Connections</th><th>Labels printed</th><th>First seen</th><th>Last connected</th></tr></thead>
            <tbody>
              {data?.printers.map((p) => (
                <tr key={p.key} onClick={() => openPrinter(p)} style={{ cursor: 'pointer' }}>
                  <td>{p.model}</td>
                  <td><span className="badge draft">{p.family}</span></td>
                  <td>{p.deviceNames}</td>
                  <td>{p.users}</td>
                  <td>{p.connections.toLocaleString()}</td>
                  <td>{p.labels.toLocaleString()}</td>
                  <td>{ago(p.firstSeen)}</td>
                  <td>{p.lastConnected ? ago(p.lastConnected) : '—'}</td>
                </tr>
              ))}
              {data && data.printers.length === 0 ? <tr><td colSpan={8}>No printers have connected yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Merge or rename rules</h2>
        <p className="lede">Every printer whose name (or model) matches the left box is shown as the name on the right, now and when it connects later.</p>
        {canEdit ? (
          <div className="toolbar">
            <input placeholder="Name to match, e.g. Seznik Tejas" value={pattern} onChange={(e) => setPattern(e.target.value)} />
            <input placeholder="Show as, e.g. SEZNIK Tejas" value={model} onChange={(e) => setModel(e.target.value)} />
            <button className="btn primary" disabled={!pattern || !model} onClick={addAlias}>Add rule</button>
          </div>
        ) : null}
        <table className="table">
          <thead><tr><th>Match</th><th>Shown as</th><th>Added</th><th /></tr></thead>
          <tbody>
            {aliases.map((a) => (
              <tr key={a.id}>
                <td>{a.pattern}</td><td>{a.displayName}</td><td>{ago(a.createdAt)}</td>
                <td>{canEdit ? <button className="btn small" onClick={() => removeAlias(a.id)}>Remove</button> : null}</td>
              </tr>
            ))}
            {aliases.length === 0 ? <tr><td colSpan={4}>No rules yet.</td></tr> : null}
          </tbody>
        </table>
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
