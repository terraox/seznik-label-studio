'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, ShieldCheck, UserCheck, Users, UserPlus } from 'lucide-react';

import { useDesk, useToast } from '@/components/desk';
import { Drawer, Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';
import type { AdminUserDto } from '@/lib/user-dto';

type Stats = { users: number; active: number; blocked: number; newLast7Days: number; internal: number; blockedNumbers: number };
type ListResponse = { users: AdminUserDto[]; total: number; page: number; pageSize: number; stats: Stats };
type HistoryRow = { id: string; action: string; message: string | null; internalNote: string | null; adminEmail: string; createdAt: string };
type Extras = {
  printers: { model: string; family: string; connections: number; labels: number; lastConnected: string | null }[];
  recentPrints: { at: string; printer: string; label: string; source: string; labels: number; jobs: number }[];
  feedback: { id: string; rating: number; category: string; message: string | null; status: string; createdAt: string }[];
  labelsLast7Days: number;
};
type BlockedPhone = { mobile: string; hasAccount: boolean; reason: string | null; blockedAt: string | null };

const PAGE_SIZE = 25;

export function UsersDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canEdit = can(desk.role, 'users.block');
  const isOwner = can(desk.role, 'users.export');
  const seePhones = can(desk.role, 'users.phones');

  const [data, setData] = useState<ListResponse | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [internal, setInternal] = useState('all');
  const [sort, setSort] = useState('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<AdminUserDto | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [phones, setPhones] = useState<BlockedPhone[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ sort, dir, page: String(page), pageSize: String(PAGE_SIZE) });
    if (q.trim()) params.set('q', q.trim());
    if (status !== 'all') params.set('status', status);
    if (internal !== 'all') params.set('internal', internal);
    api<ListResponse>(`/api/users?${params}`)
      .then((response) => {
        setData(response);
        setError('');
      })
      .catch((reason: Error) => setError(reason.message));
    api<{ phones: BlockedPhone[] }>('/api/phones').then((r) => setPhones(r.phones)).catch(() => {});
  }, [q, status, internal, sort, dir, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  const openUser = useCallback(
    (id: string) => {
      setOpenId(id);
      setExtras(null);
      setMessage('');
      setNote('');
      api<{ user: AdminUserDto; history: HistoryRow[] } & Extras>(`/api/users/${id}`)
        .then((response) => {
          setDetail(response.user);
          setHistory(response.history);
          setExtras(response);
        })
        .catch((reason: Error) => toast(reason.message, 'bad'));
    },
    [toast],
  );

  async function act(path: string, body: unknown, done: string) {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      toast(done);
      load();
      if (openId) openUser(openId);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not do that', 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function toggleInternal(user: AdminUserDto) {
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ isInternal: !user.isInternal }) });
      load();
      openUser(user.id);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not save', 'bad');
    }
  }

  async function blockNumber() {
    try {
      await api('/api/phones', { method: 'POST', body: JSON.stringify({ mobile: newPhone, reason: newReason, blocked: true }) });
      setNewPhone('');
      setNewReason('');
      toast('Number blocked');
      load();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not block', 'bad');
    }
  }

  const stats = data?.stats;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sortBy = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSort(key);
      setDir('desc');
    }
    setPage(1);
  };
  const arrow = (key: string) => (sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <>
      <PageHeader
        kicker="Accounts"
        title="App users"
        lede="Everyone who registered in the app. Block an account to sign it out everywhere and stop it signing in again."
      >
        {isOwner ? <a className="btn" href="/api/users/export">Export CSV</a> : null}
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="User summary">
        {[
          { title: 'Total users', value: stats?.users, sub: `${stats?.internal ?? 0} marked internal`, Icon: Users, color: '#3B82F6' },
          { title: 'Active', value: stats?.active, sub: 'can sign in', Icon: UserCheck, color: '#10B981' },
          { title: 'Blocked', value: stats?.blocked, sub: `${stats?.blockedNumbers ?? 0} blocked numbers in all`, Icon: Ban, color: '#EF4444' },
          { title: 'New in 7 days', value: stats?.newLast7Days, sub: 'registered recently', Icon: UserPlus, color: '#8B5CF6' },
        ].map(({ title, value, sub, Icon, color }) => (
          <article className="kpi" key={title}>
            <div className="kpi-top">
              <span className="kpi-title">{title}</span>
              <span className="kpi-icon" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
                <Icon size={16} color={color} />
              </span>
            </div>
            <div className="kpi-value">{value === undefined ? '…' : value.toLocaleString()}</div>
            <div className="kpi-sub">{sub}</div>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="toolbar">
          <input
            type="search"
            placeholder={seePhones ? 'Search name or mobile' : 'Search name'}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            aria-label="Search users"
          />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
          <select value={internal} onChange={(e) => { setInternal(e.target.value); setPage(1); }} aria-label="Internal accounts">
            <option value="all">Include internal</option>
            <option value="hide">Hide internal</option>
            <option value="only">Internal only</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th><button className="btn small ghost" onClick={() => sortBy('name')}>Name{arrow('name')}</button></th>
                <th>Mobile</th>
                <th>Printer bought</th>
                <th>Status</th>
                <th><button className="btn small ghost" onClick={() => sortBy('printCountTotal')}>Labels{arrow('printCountTotal')}</button></th>
                <th>7 days</th>
                <th><button className="btn small ghost" onClick={() => sortBy('createdAt')}>Joined{arrow('createdAt')}</button></th>
                <th><button className="btn small ghost" onClick={() => sortBy('lastSeenAt')}>Last seen{arrow('lastSeenAt')}</button></th>
                <th>App</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((user) => (
                <tr key={user.id} onClick={() => openUser(user.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    {user.name}
                    {user.isInternal ? <span className="badge draft" style={{ marginLeft: 8 }}>internal</span> : null}
                  </td>
                  <td>{user.mobile}</td>
                  <td>{user.printerName ?? '—'}</td>
                  <td><span className={user.status === 'blocked' ? 'badge rejected' : 'badge shipped'}>{user.status}</span></td>
                  <td>{user.printCountTotal.toLocaleString()}</td>
                  <td>{(user as { labelsLast7Days?: number }).labelsLast7Days ?? 0}</td>
                  <td>{ago(user.createdAt)}</td>
                  <td>{user.lastSeenAt ? ago(user.lastSeenAt) : '—'}</td>
                  <td>{user.appVersion ?? '—'}{user.platform ? ` · ${user.platform}` : ''}</td>
                </tr>
              ))}
              {data && data.users.length === 0 ? (
                <tr><td colSpan={9}>No users match.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages} · {data?.total ?? 0} users</span>
          <button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </section>

      {seePhones ? (
      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Blocked numbers</h2>
        <p className="lede">A blocked number cannot register or sign in. Block a number before it ever signs up, or review who is blocked.</p>
        {canEdit ? (
          <div className="toolbar">
            <input placeholder="10-digit mobile" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} inputMode="numeric" />
            <input placeholder="Reason (shown to the person)" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
            <button className="btn primary" disabled={!newPhone} onClick={blockNumber}>Block number</button>
          </div>
        ) : null}
        <table className="table">
          <thead><tr><th>Mobile</th><th>Account</th><th>Reason</th><th>Since</th><th /></tr></thead>
          <tbody>
            {phones.map((phone) => (
              <tr key={phone.mobile}>
                <td>{phone.mobile}</td>
                <td>{phone.hasAccount ? 'Has account' : 'No account'}</td>
                <td>{phone.reason ?? '—'}</td>
                <td>{phone.blockedAt ? ago(phone.blockedAt) : '—'}</td>
                <td>
                  {canEdit && !phone.hasAccount ? (
                    <button className="btn small" onClick={() => act('/api/phones', { mobile: phone.mobile, blocked: false }, 'Number unblocked')}>Unblock</button>
                  ) : null}
                </td>
              </tr>
            ))}
            {phones.length === 0 ? <tr><td colSpan={5}>No blocked numbers.</td></tr> : null}
          </tbody>
        </table>
      </section>
      ) : null}

      {openId && detail ? (
        <Drawer
          title={detail.name}
          lede={`${detail.mobile} · joined ${new Date(detail.createdAt).toLocaleDateString('en-IN')}`}
          onClose={() => { setOpenId(''); setDetail(null); }}
        >
          <p>
            <span className={detail.status === 'blocked' ? 'badge rejected' : 'badge shipped'}>{detail.status}</span>{' '}
            {detail.isInternal ? <span className="badge draft">internal</span> : null}
          </p>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: '0.85rem' }}>
            <dt>Printer bought</dt><dd>{detail.printerName ?? '—'}</dd>
            <dt>Labels printed</dt><dd>{detail.printCountTotal.toLocaleString()}</dd>
            <dt>Labels, last 7 days</dt><dd>{extras?.labelsLast7Days ?? 0}</dd>
            <dt>Last print</dt><dd>{detail.lastPrintAt ? ago(detail.lastPrintAt) : '—'}</dd>
            <dt>Last seen</dt><dd>{detail.lastSeenAt ? ago(detail.lastSeenAt) : '—'}</dd>
            <dt>Last login</dt><dd>{detail.lastLoginAt ? ago(detail.lastLoginAt) : '—'}</dd>
            <dt>App</dt><dd>{detail.appVersion ?? '—'} {detail.platform ?? ''} {detail.deviceModel ?? ''}</dd>
            <dt>Password</dt><dd>Set{detail.passwordUpdatedAt ? ` · changed ${ago(detail.passwordUpdatedAt)}` : ''}</dd>
          </dl>

          {detail.status === 'blocked' ? (
            <div className="note" style={{ marginTop: 12 }}>
              <strong>Blocked by {detail.blockedBy}</strong> {detail.blockedAt ? ago(detail.blockedAt) : ''}
              <div>Shown to the user: {detail.blockMessage ?? '(default text only)'}</div>
              <div>Internal note: {detail.blockInternalNote ?? '—'}</div>
            </div>
          ) : null}

          {canEdit ? (
            detail.status === 'active' ? (
              <>
                <Field label="Message shown to the user (optional)">
                  <textarea rows={2} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} />
                </Field>
                <Field label="Internal note (admins only)">
                  <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => act(`/api/users/${detail.id}/block`, { message, internalNote: note }, 'User blocked and signed out')}
                  >
                    <Ban size={14} /> Block user
                  </button>
                  <button className="btn" disabled={busy} onClick={() => act(`/api/users/${detail.id}/logout`, {}, 'Signed out everywhere')}>
                    Sign out everywhere
                  </button>
                </div>
              </>
            ) : (
              <>
                <Field label="Note (optional)">
                  <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <button className="btn primary" disabled={busy} onClick={() => act(`/api/users/${detail.id}/unblock`, { note }, 'User unblocked')}>
                    <ShieldCheck size={14} /> Unblock user
                  </button>
                </div>
              </>
            )
          ) : null}

          {canEdit ? (
            <p>
              <button className="btn small ghost" onClick={() => toggleInternal(detail)}>
                {detail.isInternal ? 'Remove internal flag' : 'Mark as internal / test account'}
              </button>
            </p>
          ) : null}

          <h2 style={{ fontSize: '1rem' }}>Printers used</h2>
          {extras && extras.printers.length > 0 ? (
            <ul style={{ paddingLeft: 18, fontSize: '0.85rem' }}>
              {extras.printers.map((p) => (
                <li key={p.model}>{p.model} <span className="badge draft">{p.family}</span> · {p.connections} connection(s) · {p.labels.toLocaleString()} labels{p.lastConnected ? ` · last ${ago(p.lastConnected)}` : ''}</li>
              ))}
            </ul>
          ) : <p>No printer has connected yet.</p>}

          <h2 style={{ fontSize: '1rem' }}>Recent prints</h2>
          {extras && extras.recentPrints.length > 0 ? (
            <table className="table">
              <thead><tr><th>When</th><th>Label</th><th>Printer</th><th>Labels</th></tr></thead>
              <tbody>
                {extras.recentPrints.map((p, i) => (
                  <tr key={i}><td>{ago(p.at)}</td><td>{p.label}</td><td>{p.printer}</td><td>{p.labels}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p>Nothing printed yet.</p>}

          <h2 style={{ fontSize: '1rem' }}>Feedback</h2>
          {extras && extras.feedback.length > 0 ? (
            <ul style={{ paddingLeft: 18, fontSize: '0.85rem' }}>
              {extras.feedback.map((f) => (
                <li key={f.id}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)} · {f.category} · {ago(f.createdAt)}{f.message ? <div>“{f.message}”</div> : null}</li>
              ))}
            </ul>
          ) : <p>No feedback yet.</p>}

          <h2 style={{ fontSize: '1rem' }}>History</h2>
          {history.length === 0 ? <p>No blocks or sign-outs yet.</p> : (
            <ul style={{ paddingLeft: 18, fontSize: '0.85rem' }}>
              {history.map((row) => (
                <li key={row.id}>
                  <strong>{row.action.replace('_', ' ')}</strong> by {row.adminEmail} · {ago(row.createdAt)}
                  {row.message ? <div>“{row.message}”</div> : null}
                  {row.internalNote ? <div>Note: {row.internalNote}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </Drawer>
      ) : null}
    </>
  );
}
