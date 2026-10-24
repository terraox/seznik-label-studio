'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, Search, ShieldCheck, X } from 'lucide-react';

import { useDesk, useHideInternal, useToast } from '@/components/desk';
import { PlatformTag } from '@/components/platform';
import { Field, Loader, PageHeader, Skeleton, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';
import type { AdminUserDto } from '@/lib/user-dto';

type Stats = { users: number; active: number; blocked: number; newLast7Days: number; internal: number; blockedNumbers: number };
type LastPrinter = { model: string; transport: string | null; at: string };
type ListResponse = {
  users: (AdminUserDto & { lastPrinter: LastPrinter | null })[]; total: number; page: number; pageSize: number; stats: Stats;
};
type HistoryRow = { id: string; action: string; message: string | null; internalNote: string | null; adminEmail: string; createdAt: string };
type PrinterSummary = { id: string; model: string; family: string; firstConnectedAt: string; lastConnectedAt: string; connections: number; labels: number; transport: string | null };
type ConnectionRow = { id: string; at: string; printer: string; family: string; transport: string };
type Extras = {
  printers: PrinterSummary[];
  connections: ConnectionRow[];
  moreConnections: boolean;
  shopClicks: { id: string; product: string; category: string; at: string }[];
  recentPrints: { at: string; printer: string; label: string; source: string; labels: number; jobs: number }[];
  feedback: { id: string; rating: number | null; category: string; title: string | null; printerName: string | null; message: string | null; status: string; createdAt: string }[];
  labelsLast7Days: number;
};

const FIELDS = [
  { id: 'all', label: 'All fields' },
  { id: 'name', label: 'Name' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'printer', label: 'Printer' },
  { id: 'platform', label: 'Platform' },
  { id: 'version', label: 'App version' },
  { id: 'device', label: 'Device' },
];
const PAGE_SIZES = [10, 25, 50, 100];
const SOURCE: Record<string, string> = { manual_size: 'Manual size', template: 'Template', excel_bulk: 'Excel', pdf: 'PDF', photo: 'Photo', scan: 'Scan', serial: 'Serial', other: 'Other' };
const TRANSPORT: Record<string, string> = { bt_spp: 'Bluetooth', ble: 'Bluetooth LE', wifi: 'Wi-Fi' };

const fullDate = (iso: string, withTime = false) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}), timeZone: 'Asia/Kolkata' });

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
  const [field, setField] = useState('all');
  const [pageSize, setPageSize] = useState(25);
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
  const [moreBusy, setMoreBusy] = useState(false);

  const [action, setAction] = useState<{ user: AdminUserDto; mode: 'block' | 'unblock' } | null>(null);

  const [globalHide] = useHideInternal();
  const load = useCallback(() => {
    const params = new URLSearchParams({ sort, dir, page: String(page), pageSize: String(pageSize) });
    if (q.trim()) {
      params.set('q', q.trim());
      params.set('field', field);
    }
    if (status !== 'all') params.set('status', status);
    // The header switch hides test accounts everywhere; this list can still narrow to "only".
    const scope = internal === 'all' && globalHide ? 'hide' : internal;
    if (scope !== 'all') params.set('internal', scope);
    api<ListResponse>(`/api/users?${params}`)
      .then((response) => {
        setData(response);
        setError('');
      })
      .catch((reason: Error) => setError(reason.message));
  }, [q, field, status, internal, globalHide, sort, dir, page, pageSize]);

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

  async function toggleInternal(user: { id: string; name: string; isInternal: boolean }) {
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ isInternal: !user.isInternal }) });
      toast(user.isInternal ? `${user.name} counts in the analytics again` : `${user.name} is a test account and is left out of the analytics`);
      load();
      if (openId === user.id) openUser(user.id);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not save', 'bad');
    }
  }

  async function loadMoreConnections() {
    if (!extras || extras.connections.length === 0) return;
    setMoreBusy(true);
    try {
      const last = extras.connections[extras.connections.length - 1];
      const more = await api<{ connections: ConnectionRow[]; more: boolean }>(`/api/users/${openId}/connections?before=${encodeURIComponent(last.at)}`);
      setExtras({ ...extras, connections: [...extras.connections, ...more.connections], moreConnections: more.more });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not load more', 'bad');
    } finally {
      setMoreBusy(false);
    }
  }

  async function submitAction() {
    if (!action) return;
    const { user, mode } = action;
    setBusy(true);
    try {
      await api(`/api/users/${user.id}/${mode}`, {
        method: 'POST',
        body: JSON.stringify(mode === 'block' ? { message, internalNote: note } : { note }),
      });
      toast(mode === 'block' ? `${user.name} blocked and signed out` : `${user.name} unblocked`);
      setAction(null);
      load();
      if (openId === user.id) openUser(user.id);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not do that', 'bad');
    } finally {
      setBusy(false);
    }
  }

  function startAction(user: AdminUserDto, mode: 'block' | 'unblock') {
    setMessage('');
    setNote('');
    setAction({ user, mode });
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const pageList = pageNumbers(page, pages);
  const from = data && data.total ? (page - 1) * pageSize + 1 : 0;
  const to = data ? Math.min(page * pageSize, data.total) : 0;
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

      <section className="panel users-panel">
        <div className="u-toolbar">
          <div className="u-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder={field === 'all' ? 'Search users…' : `Search by ${FIELDS.find((f) => f.id === field)?.label.toLowerCase()}…`}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              aria-label="Search users"
            />
            {q ? <button type="button" className="u-clear" onClick={() => { setQ(''); setPage(1); }} aria-label="Clear search"><X size={14} /></button> : null}
            <select value={field} onChange={(e) => { setField(e.target.value); setPage(1); }} aria-label="Search in">
              {FIELDS.filter((f) => seePhones || f.id !== 'mobile').map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div className="seg" role="group" aria-label="Status">
            {['all', 'active', 'blocked'].map((v) => (
              <button key={v} type="button" className={status === v ? 'on' : ''} onClick={() => { setStatus(v); setPage(1); }}>{v === 'all' ? 'All' : v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <select className="u-select" value={internal} onChange={(e) => { setInternal(e.target.value); setPage(1); }} aria-label="Internal accounts">
            <option value="all">Include test accounts</option>
            <option value="hide">Hide test accounts</option>
            <option value="only">Test accounts only</option>
          </select>
        </div>

        <div className="u-scroll">
          <table className="table u-table">
            <thead>
              <tr>
                <th><button className="th-sort" onClick={() => sortBy('name')}>User{arrow('name')}</button></th>
                <th>Mobile</th>
                <th>Printer bought</th>
                <th>Last connected printer</th>
                <th>Platform</th>
                <th>Status</th>
                {canEdit ? <th>Test account</th> : null}
                <th className="u-center"><button className="th-sort" onClick={() => sortBy('printCountTotal')}>Labels printed{arrow('printCountTotal')}</button></th>
                {canEdit ? <th className="num">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {data?.users.map((user) => (
                <tr key={user.id} onClick={() => openUser(user.id)} className="u-row">
                  <td>
                    <div className="u-name">
                      <div>
                        <b>{user.name}</b>
                        {user.isInternal ? <span className="badge draft" style={{ marginLeft: 8 }}>test</span> : null}
                        <small className="u-id" title="User ID">{user.id}</small>
                      </div>
                    </div>
                  </td>
                  <td className="u-mono">{user.mobile}</td>
                  <td>{user.printerName ?? <span className="u-muted">—</span>}</td>
                  <td>
                    {user.lastPrinter ? (
                      <div className="u-printer">
                        <b>{user.lastPrinter.model}</b>
                        <small>{user.lastPrinter.transport ? `${TRANSPORT[user.lastPrinter.transport] ?? user.lastPrinter.transport} · ` : ''}{ago(user.lastPrinter.at)}</small>
                      </div>
                    ) : <span className="u-muted">Never connected</span>}
                  </td>
                  <td><PlatformTag value={user.platform} />{user.appVersion ? <small className="u-ver">v{user.appVersion}</small> : null}</td>
                  <td><span className={user.status === 'blocked' ? 'badge rejected' : 'badge shipped'}>{user.status}</span></td>
                  {canEdit ? (
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={user.isInternal}
                        aria-label={`Mark ${user.name} as test account`}
                        className={`switch${user.isInternal ? ' on' : ''}`}
                        onClick={() => toggleInternal(user)}
                      ><i /></button>
                    </td>
                  ) : null}
                  <td className="u-center u-labels">{user.printCountTotal.toLocaleString()}</td>
                  {canEdit ? (
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      {user.status === 'active' ? (
                        <button className="btn small danger" onClick={() => startAction(user, 'block')}><Ban size={12} /> Block</button>
                      ) : (
                        <button className="btn small" onClick={() => startAction(user, 'unblock')}><ShieldCheck size={12} /> Unblock</button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
              {!data ? <SkeletonRows cols={canEdit ? 9 : 7} /> : null}
              {data && data.users.length === 0 ? <tr><td colSpan={canEdit ? 9 : 7} className="empty">No users match this search.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="u-pager">
          <nav className="pager" aria-label="Pages">
            <button className="pager-step" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            {pageList.map((n, i) => n === null ? <span key={`gap${i}`} className="pager-gap">…</span> : (
              <button key={n} className={`pager-n${n === page ? ' on' : ''}`} onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
            ))}
            <button className="pager-step" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
          <label className="u-size">Rows per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="u-count">Showing {from.toLocaleString()}–{to.toLocaleString()} of {(data?.total ?? 0).toLocaleString()}</span>
        </div>
      </section>

      {action ? (
        <>
          <button className="drawer-back" aria-label="Close" onClick={() => setAction(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label={action.mode === 'block' ? 'Block user' : 'Unblock user'}>
            <div className="modal-head">
              <div>
                <h2>{action.mode === 'block' ? 'Block' : 'Unblock'} {action.user.name}</h2>
                <p>{action.mode === 'block' ? 'They are signed out of every device and cannot sign in again until unblocked.' : 'They can sign in again; they will need to log in once more.'}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setAction(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="modal-body">
              {action.mode === 'block' ? (
                <>
                  <Field label="Message shown to the user (optional)">
                    <textarea rows={2} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Your account was suspended for misuse." />
                  </Field>
                  <Field label="Internal note (admins only)">
                    <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this account is being blocked" />
                  </Field>
                </>
              ) : (
                <Field label="Note (optional)">
                  <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this account is being unblocked" />
                </Field>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setAction(null)}>Cancel</button>
              <button className={action.mode === 'block' ? 'btn primary danger-solid' : 'btn primary'} disabled={busy} onClick={submitAction}>
                {action.mode === 'block' ? <><Ban size={14} /> Block user</> : <><ShieldCheck size={14} /> Unblock user</>}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {openId && detail ? (
        <>
          <button className="drawer-back" aria-label="Close" onClick={() => { setOpenId(''); setDetail(null); }} />
          <div className="ucard" role="dialog" aria-modal="true" aria-labelledby="ucard-title">
            <header className="ucard-head">
              <div className="ucard-title">
                <h2 id="ucard-title">{detail.name}</h2>
                <div className="ucard-tags">
                  <span className={detail.status === 'blocked' ? 'badge rejected' : 'badge shipped'}>{detail.status}</span>
                  <PlatformTag value={detail.platform} />
                  {detail.isInternal ? <span className="badge draft">test account</span> : null}
                </div>
                <button type="button" className="ucard-id" title="Copy user ID" onClick={() => { void navigator.clipboard?.writeText(detail.id); toast('User ID copied'); }}>
                  {detail.id}
                </button>
              </div>
              <button type="button" className="icon-btn" onClick={() => { setOpenId(''); setDetail(null); }} aria-label="Close"><X size={16} /></button>
            </header>

            <div className="ucard-body">
              <section className="ucard-stats">
                <div><b>{detail.printCountTotal.toLocaleString()}</b><span>Labels printed</span></div>
                <div><b>{extras ? (extras.labelsLast7Days ?? 0).toLocaleString() : <Skeleton width={34} height={14} />}</b><span>Last 7 days</span></div>
                <div><b>{extras ? extras.printers.length : <Skeleton width={24} height={14} />}</b><span>Printers used</span></div>
                <div><b>{extras ? extras.printers.reduce((n, p) => n + p.connections, 0).toLocaleString() : <Skeleton width={30} height={14} />}</b><span>Connections</span></div>
              </section>

              <section className="ucard-sec">
                <h3>Details</h3>
                <dl className="ucard-grid">
                  <div><dt>Mobile</dt><dd className="u-mono">{detail.mobile}</dd></div>
                  <div><dt>Printer bought</dt><dd>{detail.printerName ?? '—'}</dd></div>
                  <div><dt>Registered</dt><dd>{fullDate(detail.createdAt)}</dd></div>
                  <div><dt>Last seen</dt><dd>{detail.lastSeenAt ? ago(detail.lastSeenAt) : '—'}</dd></div>
                  <div><dt>Last login</dt><dd>{detail.lastLoginAt ? ago(detail.lastLoginAt) : '—'}</dd></div>
                  <div><dt>Last print</dt><dd>{detail.lastPrintAt ? ago(detail.lastPrintAt) : '—'}</dd></div>
                  <div><dt>App version</dt><dd>{detail.appVersion ? `v${detail.appVersion}` : '—'}</dd></div>
                  <div><dt>Device</dt><dd>{detail.deviceModel ?? '—'}</dd></div>
                  <div><dt>Password</dt><dd>{detail.passwordUpdatedAt ? `Changed ${ago(detail.passwordUpdatedAt)}` : 'Set at registration'}</dd></div>
                </dl>
              </section>

              {detail.status === 'blocked' ? (
                <section className="ucard-blocked">
                  <b>Blocked by {detail.blockedBy}</b> {detail.blockedAt ? ago(detail.blockedAt) : ''}
                  <div>Shown to the user: {detail.blockMessage ?? '(default text only)'}</div>
                  <div>Internal note: {detail.blockInternalNote ?? '—'}</div>
                </section>
              ) : null}

              <details className="ucard-sec ucard-fold">
                <summary><h3>Printers connected <small>{extras ? extras.printers.length : ''}</small></h3></summary>
                {!extras ? <Loader compact label="Loading printers" /> : extras.printers.length === 0 ? <p className="u-muted">No printer has connected yet.</p> : (
                  <div className="ucard-scroll">
                    <table className="table ucard-table">
                      <thead><tr><th>Printer</th><th>First connected</th><th>Last connected</th><th className="num">Connections</th><th className="num">Labels</th></tr></thead>
                      <tbody>
                        {extras.printers.map((p) => (
                          <tr key={p.id}>
                            <td><b>{p.model}</b><small className="u-ver">{p.transport ? TRANSPORT[p.transport] ?? p.transport : ''}</small></td>
                            <td>{fullDate(p.firstConnectedAt)}</td>
                            <td>{ago(p.lastConnectedAt)}</td>
                            <td className="num">{p.connections.toLocaleString()}</td>
                            <td className="num">{p.labels.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>

              <details className="ucard-sec ucard-fold">
                <summary><h3>Connection history <small>{extras ? `${extras.connections.length}${extras.moreConnections ? '+' : ''}` : ''}</small></h3></summary>
                {!extras ? <Loader compact label="Loading connections" /> : extras.connections.length === 0 ? <p className="u-muted">Nothing yet. Connections appear once the user connects a printer in the app.</p> : (
                  <ol className="timeline">
                    {extras.connections.map((c) => (
                      <li key={c.id}>
                        <b>{c.printer}</b>
                        <span>{TRANSPORT[c.transport] ?? c.transport}</span>
                        <time title={new Date(c.at).toLocaleString('en-IN')}>{fullDate(c.at, true)}</time>
                      </li>
                    ))}
                  </ol>
                )}
                {extras?.moreConnections ? (
                  <button type="button" className="btn small" disabled={moreBusy} onClick={loadMoreConnections}>{moreBusy ? 'Loading…' : 'Show older connections'}</button>
                ) : null}
              </details>

              <details className="ucard-sec ucard-fold">
                <summary><h3>Recent prints</h3></summary>
                {extras && extras.recentPrints.length > 0 ? (
                  <div className="ucard-scroll">
                    <table className="table ucard-table">
                      <thead><tr><th>When</th><th>Label</th><th>Source</th><th>Printer</th><th className="num">Labels</th></tr></thead>
                      <tbody>
                        {extras.recentPrints.map((p, i) => (
                          <tr key={i}><td>{ago(p.at)}</td><td>{p.label}</td><td>{SOURCE[p.source] ?? p.source}</td><td>{p.printer}</td><td className="num">{p.labels}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : extras ? <p className="u-muted">Nothing printed yet.</p> : <Loader compact label="Loading prints" />}
              </details>

              <details className="ucard-sec ucard-fold">
                <summary><h3>Shop clicks <small>{extras ? extras.shopClicks.length : ''}</small></h3></summary>
                {extras && extras.shopClicks.length > 0 ? (
                  <ul className="ucard-list">
                    {extras.shopClicks.map((c) => (
                      <li key={c.id}><b>{c.product}</b> <span className="u-muted">· {c.category} · {ago(c.at)}</span></li>
                    ))}
                  </ul>
                ) : extras ? <p className="u-muted">Has not pressed Buy on any product yet.</p> : <Loader compact label="Loading shop clicks" />}
              </details>

              <details className="ucard-sec ucard-fold">
                <summary>
                  <h3>Feedback <small>{extras ? extras.feedback.length : ''}</small></h3>
                  {extras && extras.feedback[0] ? (
                    <span className="fold-peek">
                      {extras.feedback[0].category}
                      {extras.feedback[0].title ? ` · ${extras.feedback[0].title}` : ''}
                      {extras.feedback[0].message ? ` “${extras.feedback[0].message}”` : ''}
                    </span>
                  ) : null}
                </summary>
                {extras && extras.feedback.length > 0 ? (
                  <ul className="ucard-list">
                    {extras.feedback.map((f) => (
                      <li key={f.id}>
                        {f.category}{f.printerName ? ` · ${f.printerName}` : ''} · {ago(f.createdAt)}
                        {f.title ? <div><b>{f.title}</b></div> : null}
                        {f.message ? <div>“{f.message}”</div> : null}
                      </li>
                    ))}
                  </ul>
                ) : extras ? <p className="u-muted">No feedback yet.</p> : <Loader compact label="Loading feedback" />}
              </details>

              <details className="ucard-sec ucard-fold">
                <summary><h3>Admin history</h3></summary>
                {history.length === 0 ? <p className="u-muted">No blocks or sign-outs yet.</p> : (
                  <ul className="ucard-list">
                    {history.map((row) => (
                      <li key={row.id}>
                        <b>{row.action.replace('_', ' ')}</b> by {row.adminEmail} · {ago(row.createdAt)}
                        {row.message ? <div>“{row.message}”</div> : null}
                        {row.internalNote ? <div>Note: {row.internalNote}</div> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </div>

            {canEdit ? (
              <footer className="ucard-foot">
                <label className="ucard-test">
                  <button type="button" role="switch" aria-checked={detail.isInternal} className={`switch${detail.isInternal ? ' on' : ''}`} onClick={() => toggleInternal(detail)} aria-label="Test account"><i /></button>
                  <span>Test account<small>Left out of the analytics</small></span>
                </label>
                <div className="ucard-actions">
                  <button className="btn" disabled={busy} onClick={() => act(`/api/users/${detail.id}/logout`, {}, 'Signed out everywhere')}>Sign out everywhere</button>
                  {detail.status === 'active' ? (
                    <button className="btn danger" onClick={() => startAction(detail, 'block')}><Ban size={14} /> Block user</button>
                  ) : (
                    <button className="btn primary" onClick={() => startAction(detail, 'unblock')}><ShieldCheck size={14} /> Unblock user</button>
                  )}
                </div>
              </footer>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}

/** Page numbers with gaps: 1 … 4 5 6 … 20. */
function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
